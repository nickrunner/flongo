import { vi } from 'vitest';

// Mock MongoDB ObjectId for tests
vi.mock('mongodb', async () => {
  const actual = await vi.importActual('mongodb');
  
  class MockObjectId {
    private id: string;
    
    constructor(id?: string) {
      this.id = id || '507f1f77bcf86cd799439011';
    }
    
    toString() {
      return this.id;
    }
    
    toHexString() {
      return this.id;
    }
    
    static isValid(id: any) {
      return typeof id === 'string' && id.length === 24;
    }
  }
  
  return {
    ...actual,
    ObjectId: MockObjectId
  };
});

// Global test utilities
(global as any).mockObjectId = (id?: string) => id || '507f1f77bcf86cd799439011';