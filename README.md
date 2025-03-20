# FAISS Viewer

A Visual Studio Code extension for viewing and exploring FAISS vector indices.

## Features

- Connect to and explore FAISS vector indices
- View vector dimensions and metadata
- Search and filter vectors
- Visualize vector data
- Export vector data

## Requirements

- Node.js and npm installed
- FAISS index files

## Extension Settings

This extension contributes the following settings:

- `faissViewer.maxVectorsPerPage`: Maximum number of vectors to display per page
- `faissViewer.defaultIndexPath`: Default path to look for FAISS indices

## Usage

1. Open the FAISS Viewer sidebar
2. Click "Connect to FAISS Index" to select your index file
3. Browse through the vectors using the tree view
4. Use the search functionality to find specific vectors
5. Click on a vector to view its details

## Known Issues

- Large indices may take some time to load
- Some complex vector types may not be fully supported

## Release Notes

### 0.0.1

Initial release of FAISS Viewer:

- Basic FAISS index viewing capabilities
- Vector search and filtering
- Vector visualization
- Export functionality

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Donate

If you find this extension helpful, consider supporting its development through GitHub Sponsors:

[![GitHub Sponsors](https://img.shields.io/badge/Sponsor%20on%20GitHub-%23EA4AAA?style=for-the-badge&logo=github&logoColor=white)](https://github.com/sponsors/jdsans)

## License

This extension is licensed under the MIT License - see the LICENSE file for details.
