declare module 'faiss-node' {
  export interface SearchResult {
    indices: Float32Array;
    distances: Float32Array;
  }

  export class Index {
    static read(path: string): Promise<Index>;
    getDimension(): Promise<number>;
    ntotal(): Promise<number>;
    search(vector: number[], k: number): Promise<SearchResult>;
    write(): Promise<Buffer>;
  }
}
