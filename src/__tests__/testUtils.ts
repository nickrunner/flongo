import { vi } from "vitest";
import type { Collection, Db, MongoClient } from "mongodb";

// Mock MongoDB collection methods
export const createMockCollection = () => {
  return {
    findOne: vi.fn(),
    find: vi.fn(() => ({
      toArray: vi.fn(),
      limit: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis()
    })),
    insertOne: vi.fn(),
    insertMany: vi.fn(),
    updateOne: vi.fn(),
    updateMany: vi.fn(),
    deleteOne: vi.fn(),
    deleteMany: vi.fn(),
    countDocuments: vi.fn(),
    findOneAndUpdate: vi.fn()
  } as any;
};

// Mock MongoDB database
export const createMockDb = () => {
  const mockCollection = createMockCollection();

  return {
    collection: vi.fn(() => mockCollection)
  } as any;
};

// Mock MongoDB client
export const createMockClient = () => {
  const mockDb = createMockDb();

  return {
    db: vi.fn(() => mockDb)
  } as any;
};

// Sample test data
export interface TestUser {
  name: string;
  email: string;
  age: number;
  tags: string[];
  isActive: boolean;
  loginCount?: number;
  credits?: number; // Optional field for credits
}

export const sampleUsers: TestUser[] = [
  {
    name: "John Doe",
    email: "john@example.com",
    age: 30,
    tags: ["developer", "typescript"],
    isActive: true
  },
  {
    name: "Jane Smith",
    email: "jane@example.com",
    age: 25,
    tags: ["designer", "frontend"],
    isActive: true
  },
  {
    name: "Bob Johnson",
    email: "bob@example.com",
    age: 35,
    tags: ["manager", "backend"],
    isActive: false
  }
];

export const sampleUsersWithIds = sampleUsers.map((user, index) => ({
  ...user,
  _id: `507f1f77bcf86cd79943901${index}`,
  createdAt: Date.now() - index * 1000,
  updatedAt: Date.now() - index * 500
}));

// Helper to create expected MongoDB query
export const expectMongoQuery = (expectedQuery: any) => {
  const { expect } = require("vitest");
  return expect.objectContaining(expectedQuery);
};

// Helper to mock flongo database
export const mockFlongoDb = () => {
  const mockCollection = createMockCollection();
  const mockDb = createMockDb();

  // Mock the flongo module
  vi.doMock("../flongo", () => ({
    flongoDb: mockDb,
    flongoClient: createMockClient(),
    initializeFlongo: vi.fn(),
    FlongoConfig: {}
  }));

  return { mockDb, mockCollection };
};
