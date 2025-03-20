import * as vscode from 'vscode';
import * as path from 'path';
import { Index, SearchResult } from 'faiss-node';
import * as fs from 'fs';
import * as os from 'os';

interface VectorData {
  id: string;
  vector: number[];
  metadata?: any;
}

class FaissDataProvider implements vscode.TreeDataProvider<FaissItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    FaissItem | undefined | null | void
  > = new vscode.EventEmitter<FaissItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    FaissItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private faissIndex: Index | null = null;
  private indexPath: string | null = null;
  private memories: any[] = [];

  constructor(private context: vscode.ExtensionContext) {}

  refresh(): void {
    if (this.indexPath) {
      this.connectToIndex(this.indexPath);
    } else {
      this._onDidChangeTreeData.fire();
    }
  }

  async connectToIndex(filePath: string) {
    let tempPath: string | null = null;
    try {
      console.log('Attempting to connect to FAISS index at:', filePath);
      this.indexPath = filePath;

      // Read the JSON file
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      this.memories = data.memories;

      // Create a temporary file to store the index buffer
      tempPath = path.join(os.tmpdir(), `temp_faiss_${Date.now()}.index`);
      console.log('Creating temporary file at:', tempPath);

      if (!data.index) {
        throw new Error('No index data found in the JSON file');
      }

      const indexBuffer = Buffer.from(data.index, 'base64');
      fs.writeFileSync(tempPath, indexBuffer);
      console.log('Successfully wrote index buffer to temporary file');

      // Verify the temporary file exists and has content
      if (!fs.existsSync(tempPath) || fs.statSync(tempPath).size === 0) {
        throw new Error('Failed to create valid temporary index file');
      }

      // Read the index from the temporary file
      console.log('Attempting to read FAISS index from temporary file');
      this.faissIndex = await Index.read(tempPath);
      console.log('Successfully connected to FAISS index');

      // Save the path only after successful connection
      await this.context.globalState.update('faissDataPath', filePath);

      // Set the connected context
      await vscode.commands.executeCommand(
        'setContext',
        'faissViewConnected',
        true
      );

      // Fire the tree data change event to update the view
      this._onDidChangeTreeData.fire();
    } catch (error) {
      console.error('Failed to connect to FAISS index:', error);
      vscode.window.showErrorMessage(
        `Failed to connect to FAISS index: ${error}`
      );
      // Clear the saved path if connection fails
      await this.context.globalState.update('faissDataPath', undefined);
      this.indexPath = null;
      this.faissIndex = null;
      this.memories = [];

      // Clear the connected context
      await vscode.commands.executeCommand(
        'setContext',
        'faissViewConnected',
        false
      );

      // Fire the tree data change event to update the view
      this._onDidChangeTreeData.fire();
      throw error;
    } finally {
      // Clean up the temporary file
      if (tempPath && fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
          console.log('Successfully cleaned up temporary file');
        } catch (error) {
          console.warn('Failed to clean up temporary file:', error);
        }
      }
    }
  }

  getTreeItem(element: FaissItem): vscode.TreeItem {
    if (element.label === 'Refresh') {
      element.iconPath = new vscode.ThemeIcon('refresh');
      element.tooltip = 'Refresh the FAISS index';
    } else if (element.label === 'View Vectors') {
      element.iconPath = new vscode.ThemeIcon('symbol-array');
      element.tooltip = 'View all vectors';
    } else if (element.label === 'Disconnect') {
      element.iconPath = new vscode.ThemeIcon('close');
      element.tooltip = 'Disconnect from current FAISS index';
    } else if (element.label.startsWith('Connect to')) {
      element.iconPath = new vscode.ThemeIcon('folder-opened');
      element.tooltip = 'Connect to a FAISS index file';
    }
    return element;
  }

  async getChildren(element?: FaissItem): Promise<FaissItem[]> {
    if (!this.faissIndex) {
      return [
        new FaissItem(
          'Connect to a FAISS index',
          vscode.TreeItemCollapsibleState.None,
          {
            command: 'vscode-faiss-viewer.connect',
            title: 'Connect to FAISS Index',
            arguments: [],
          }
        ),
      ];
    }

    if (!element) {
      try {
        const dimension = await this.faissIndex.getDimension();
        const ntotal = await this.faissIndex.ntotal();
        return [
          new FaissItem(
            `Dimension: ${dimension}`,
            vscode.TreeItemCollapsibleState.None
          ),
          new FaissItem(
            `Total Vectors: ${ntotal}`,
            vscode.TreeItemCollapsibleState.None
          ),
          new FaissItem('View Vectors', vscode.TreeItemCollapsibleState.None, {
            command: 'vscode-faiss-viewer.openVectorView',
            title: 'Open Vector View',
            arguments: [],
          }),
        ];
      } catch (error) {
        console.error('Error getting index information:', error);
        return [
          new FaissItem(
            'Error loading index information',
            vscode.TreeItemCollapsibleState.None
          ),
        ];
      }
    }

    return [];
  }

  async searchVectors(vector: number[]): Promise<{
    indices: number[];
    distances: number[];
    memories: any[];
  } | null> {
    if (!this.faissIndex) {
      return null;
    }
    try {
      const results = await this.faissIndex.search(vector, 5);
      const memories = Array.from(results.indices).map(
        (idx) => this.memories[idx]
      );
      return {
        indices: Array.from(results.indices),
        distances: Array.from(results.distances),
        memories,
      };
    } catch (error) {
      console.error('Search failed:', error);
      vscode.window.showErrorMessage(`Search failed: ${error}`);
      return null;
    }
  }

  getMemoryById(id: string) {
    return this.memories.find((memory) => memory.id === id);
  }

  getAllMemories() {
    return this.memories;
  }

  async disconnect() {
    if (this.faissIndex) {
      this.faissIndex = null;
      this.indexPath = null;
      this.memories = [];
      // Clear the saved path when disconnecting
      await this.context.globalState.update('faissDataPath', undefined);
      // Clear the connected context
      await vscode.commands.executeCommand(
        'setContext',
        'faissViewConnected',
        false
      );
      this.refresh();
    }
  }
}

class FaissItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command
  ) {
    super(label, collapsibleState);
    if (command) {
      this.command = command;
    }
  }
}

export async function activate(context: vscode.ExtensionContext) {
  console.log('FAISS Viewer extension is now active');
  const faissProvider = new FaissDataProvider(context);

  // Initialize the connected context
  await vscode.commands.executeCommand(
    'setContext',
    'faissViewConnected',
    false
  );

  // Create the tree view
  const treeView = vscode.window.createTreeView('faissView', {
    treeDataProvider: faissProvider,
    showCollapseAll: true,
    manageCheckboxStateManually: false,
  });

  // Add tree view to subscriptions
  context.subscriptions.push(treeView);

  // Register all commands
  context.subscriptions.push(
    vscode.commands.registerCommand('vscode-faiss-viewer.refresh', () => {
      console.log('Refresh command triggered');
      faissProvider.refresh();
    }),
    vscode.commands.registerCommand(
      'vscode-faiss-viewer.disconnect',
      async () => {
        console.log('Disconnect command triggered');
        await faissProvider.disconnect();
      }
    ),
    vscode.commands.registerCommand('vscode-faiss-viewer.connect', async () => {
      console.log('Connect command triggered');
      const filePath = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: {
          'FAISS Index': ['index'],
        },
      });

      console.log('Selected file path:', filePath);
      if (filePath && filePath[0]) {
        // Save the selected path
        await context.globalState.update('faissDataPath', filePath[0].fsPath);
        await faissProvider.connectToIndex(filePath[0].fsPath);
      }
    }),
    vscode.commands.registerCommand(
      'vscode-faiss-viewer.openVectorView',
      async () => {
        console.log('Opening vector view...');
        const panel = vscode.window.createWebviewPanel(
          'vectorView',
          'FAISS Vector Explorer',
          vscode.ViewColumn.One,
          {
            enableScripts: true,
            retainContextWhenHidden: true,
          }
        );

        const memories = faissProvider.getAllMemories();
        console.log(`Found ${memories.length} memories`);
        console.log(
          'First memory structure:',
          JSON.stringify(memories[0], null, 2)
        );
        const uniqueRoles = [...new Set(memories.map((m) => m.metadata?.role))];
        const uniqueThreadIds = [
          ...new Set(memories.map((m) => m.metadata?.threadId)),
        ];
        console.log(`Unique roles: ${uniqueRoles.join(', ')}`);
        console.log(`Unique thread IDs: ${uniqueThreadIds.join(', ')}`);

        panel.webview.html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { 
              padding: 20px;
              font-family: var(--vscode-font-family);
              color: var(--vscode-editor-foreground);
            }
            .controls {
              margin-bottom: 20px;
              padding: 15px;
              background: var(--vscode-editor-background);
              border: 1px solid var(--vscode-panel-border);
              border-radius: 4px;
            }
            .search-box {
              width: 100%;
              padding: 8px;
              margin-bottom: 10px;
              background: var(--vscode-input-background);
              border: 1px solid var(--vscode-input-border);
              color: var(--vscode-input-foreground);
              border-radius: 4px;
            }
            .filters {
              display: flex;
              gap: 10px;
              margin-bottom: 10px;
            }
            .pagination-controls {
              display: flex;
              align-items: center;
              gap: 10px;
              margin-bottom: 10px;
            }
            select {
              padding: 6px;
              background: var(--vscode-input-background);
              border: 1px solid var(--vscode-input-border);
              color: var(--vscode-input-foreground);
              border-radius: 4px;
            }
            .vector-list {
              display: grid;
              grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
              gap: 15px;
            }
            .vector-list.list-view {
              display: flex;
              flex-direction: column;
              gap: 5px;
            }
            .vector-list.list-view .vector-card {
              width: 100%;
              padding: 8px;
              display: flex;
              align-items: center;
              gap: 15px;
            }
            .vector-list.list-view .vector-card h3 {
              margin: 0;
              min-width: 100px;
            }
            .vector-list.list-view .vector-card p {
              margin: 0;
              flex: 1;
            }
            .vector-card {
              background: var(--vscode-editor-background);
              border: 1px solid var(--vscode-panel-border);
              border-radius: 4px;
              padding: 15px;
              cursor: pointer;
              transition: all 0.2s;
            }
            .vector-card-content {
              cursor: pointer;
            }
            .pagination {
              display: flex;
              justify-content: center;
              align-items: center;
              gap: 10px;
              margin-top: 20px;
            }
            .pagination button {
              padding: 5px 10px;
              background: var(--vscode-button-background);
              color: var(--vscode-button-foreground);
              border: none;
              border-radius: 4px;
              cursor: pointer;
            }
            .pagination button:disabled {
              opacity: 0.5;
              cursor: not-allowed;
            }
            .page-input {
              width: 50px;
              padding: 5px;
              text-align: center;
              background: var(--vscode-input-background);
              border: 1px solid var(--vscode-input-border);
              color: var(--vscode-input-foreground);
              border-radius: 4px;
            }
          </style>
        </head>
        <body>
          <div class="controls">
            <input type="text" class="search-box" placeholder="Search vectors...">
            <div class="filters">
              <select id="roleFilter">
                <option value="">All Roles</option>
                ${uniqueRoles
                  .map((role) => `<option value="${role}">${role}</option>`)
                  .join('')}
              </select>
              <select id="threadFilter">
                <option value="">All Threads</option>
                ${uniqueThreadIds
                  .map((id) => `<option value="${id}">${id}</option>`)
                  .join('')}
              </select>
              <select id="viewMode">
                <option value="grid">Grid View</option>
                <option value="list">List View</option>
              </select>
            </div>
            <div class="pagination-controls">
              <label>Items per page:</label>
              <select id="itemsPerPage">
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
          </div>
          <div id="vectorList" class="vector-list"></div>
          <div class="pagination">
            <button id="prevPage" disabled>Previous</button>
            <span id="pageInfo">Page 1 of 1</span>
            <input type="number" id="pageInput" class="page-input" min="1" value="1">
            <button id="nextPage" disabled>Next</button>
          </div>
          <script>
            const vscode = acquireVsCodeApi();
            let currentPage = 1;
            let itemsPerPage = 10;
            let filteredMemories = ${JSON.stringify(memories)};
            let currentViewMode = 'grid';

            function updateView() {
              const startIndex = (currentPage - 1) * itemsPerPage;
              const endIndex = startIndex + itemsPerPage;
              const pageMemories = filteredMemories.slice(startIndex, endIndex);
              const totalPages = Math.ceil(filteredMemories.length / itemsPerPage);

              const vectorList = document.getElementById('vectorList');
              vectorList.innerHTML = pageMemories.map(memory => {
                // Get the vector length from either vector or embedding property
                const vectorLength = memory.vector ? memory.vector.length : 
                                   memory.embedding ? memory.embedding.length : 0;
                
                return \`
                  <div class="vector-card">
                    <div class="vector-card-content" onclick="showVectorDetails('\${memory.id}')">
                      <h3>ID: \${memory.id}</h3>
                      <p>Role: \${memory.metadata?.role || 'N/A'}</p>
                      <p>Thread ID: \${memory.metadata?.threadId || 'N/A'}</p>
                      <p>Vector Length: \${vectorLength}</p>
                      <p>Content: \${memory.metadata?.content ? memory.metadata.content.substring(0, 100) + '...' : 'No content'}</p>
                    </div>
                  </div>
                \`;
              }).join('');

              document.getElementById('prevPage').disabled = currentPage === 1;
              document.getElementById('nextPage').disabled = currentPage === totalPages;
              document.getElementById('pageInfo').textContent = \`Page \${currentPage} of \${totalPages}\`;
            }

            function showVectorDetails(id) {
              vscode.postMessage({
                command: 'showVectorDetails',
                id: id
              });
            }

            document.getElementById('roleFilter').addEventListener('change', (e) => {
              const role = e.target.value;
              filteredMemories = ${JSON.stringify(
                memories
              )}.filter(m => !role || m.metadata.role === role);
              currentPage = 1;
              updateView();
            });

            document.getElementById('threadFilter').addEventListener('change', (e) => {
              const threadId = e.target.value;
              filteredMemories = ${JSON.stringify(
                memories
              )}.filter(m => !threadId || m.metadata.threadId === threadId);
              currentPage = 1;
              updateView();
            });

            document.getElementById('viewMode').addEventListener('change', (e) => {
              currentViewMode = e.target.value;
              const vectorList = document.getElementById('vectorList');
              vectorList.className = \`vector-list \${currentViewMode}-view\`;
            });

            document.getElementById('itemsPerPage').addEventListener('change', (e) => {
              itemsPerPage = parseInt(e.target.value);
              currentPage = 1;
              updateView();
            });

            document.getElementById('prevPage').addEventListener('click', () => {
              if (currentPage > 1) {
                currentPage--;
                updateView();
              }
            });

            document.getElementById('nextPage').addEventListener('click', () => {
              const totalPages = Math.ceil(filteredMemories.length / itemsPerPage);
              if (currentPage < totalPages) {
                currentPage++;
                updateView();
              }
            });

            document.querySelector('.search-box').addEventListener('input', (e) => {
              const searchTerm = e.target.value.toLowerCase();
              filteredMemories = ${JSON.stringify(memories)}.filter(m => 
                m.id.toLowerCase().includes(searchTerm) ||
                m.metadata.role.toLowerCase().includes(searchTerm) ||
                m.metadata.threadId.toLowerCase().includes(searchTerm)
              );
              currentPage = 1;
              updateView();
            });

            document.getElementById('pageInput').addEventListener('change', (e) => {
              const page = parseInt(e.target.value);
              const totalPages = Math.ceil(filteredMemories.length / itemsPerPage);
              if (page >= 1 && page <= totalPages) {
                currentPage = page;
                updateView();
              } else {
                e.target.value = currentPage;
              }
            });

            document.getElementById('pageInput').addEventListener('keypress', (e) => {
              if (e.key === 'Enter') {
                const page = parseInt(e.target.value);
                const totalPages = Math.ceil(filteredMemories.length / itemsPerPage);
                if (page >= 1 && page <= totalPages) {
                  currentPage = page;
                  updateView();
                } else {
                  e.target.value = currentPage;
                }
              }
            });

            updateView();
          </script>
        </body>
      </html>
    `;

        panel.webview.onDidReceiveMessage(async (message) => {
          switch (message.command) {
            case 'showVectorDetails':
              const memory = faissProvider.getMemoryById(message.id);
              if (memory) {
                const detailsPanel = vscode.window.createWebviewPanel(
                  'vectorDetails',
                  `Vector ${message.id}`,
                  vscode.ViewColumn.One,
                  {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                  }
                );

                detailsPanel.webview.html = `
              <!DOCTYPE html>
              <html>
                <head>
                  <style>
                    body { 
                      padding: 20px;
                      font-family: var(--vscode-font-family);
                      color: var(--vscode-editor-foreground);
                    }
                    .section {
                      margin-bottom: 20px;
                      padding: 10px;
                      border: 1px solid var(--vscode-panel-border);
                      border-radius: 4px;
                    }
                    .section-title {
                      font-weight: bold;
                      margin-bottom: 10px;
                      color: var(--vscode-editor-foreground);
                    }
                    .content {
                      white-space: pre-wrap;
                      background: var(--vscode-editor-background);
                      padding: 10px;
                      border-radius: 4px;
                    }
                    .vector-values {
                      display: grid;
                      grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
                      gap: 5px;
                    }
                    .vector-value {
                      background: var(--vscode-editor-background);
                      padding: 5px;
                      border-radius: 4px;
                      font-family: monospace;
                    }
                    .metadata-item {
                      margin: 5px 0;
                    }
                    .metadata-label {
                      font-weight: bold;
                      color: var(--vscode-descriptionForeground);
                    }
                  </style>
                </head>
                <body>
                  <div class="section">
                    <div class="section-title">Metadata</div>
                    <div class="metadata-item">
                      <span class="metadata-label">ID:</span> ${memory.id}
                    </div>
                    <div class="metadata-item">
                      <span class="metadata-label">Role:</span> ${
                        memory.metadata.role
                      }
                    </div>
                    <div class="metadata-item">
                      <span class="metadata-label">Thread ID:</span> ${
                        memory.metadata.threadId
                      }
                    </div>
                    <div class="metadata-item">
                      <span class="metadata-label">Timestamp:</span> ${
                        memory.metadata.timestamp || 'N/A'
                      }
                    </div>
                  </div>

                  <div class="section">
                    <div class="section-title">Content</div>
                    <div class="content">${
                      memory.metadata.content || 'No content available'
                    }</div>
                  </div>

                  <div class="section">
                    <div class="section-title">Vector Values</div>
                    <div class="vector-values">
                      ${(memory.vector || memory.embedding || [])
                        .map(
                          (value: number, i: number) => `
                        <div class="vector-value">[${i}]: ${value.toFixed(
                            6
                          )}</div>
                      `
                        )
                        .join('')}
                    </div>
                  </div>
                </body>
              </html>
            `;
                detailsPanel.reveal(vscode.ViewColumn.One);
              }
              break;
            case 'searchVectors':
              const results = await faissProvider.searchVectors(message.vector);
              if (results) {
                panel.webview.postMessage({
                  command: 'searchResults',
                  results: results.memories.map((memory, i) => ({
                    memory,
                    distance: results.distances[i],
                  })),
                });
              }
              break;
          }
        });
      }
    )
  );

  // Load saved path and attempt to connect
  const savedPath = context.globalState.get<string>('faissDataPath');
  if (savedPath) {
    console.log('Found saved path:', savedPath);
    faissProvider.connectToIndex(savedPath).catch((error) => {
      console.error('Failed to connect to saved path:', error);
      vscode.window.showErrorMessage(
        `Failed to connect to saved FAISS index: ${error}`
      );
    });
  }
}

export function deactivate() {
  // The extension will clean up its state automatically when deactivated
  // The global state will be cleared when the extension is uninstalled
}
