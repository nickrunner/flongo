import { createHash } from 'crypto';
import { ICollectionQuery, Pagination, SortDirection } from '../types';

// Type definitions for normalized values
interface NormalizedObject {
  [key: string]: NormalizedValue;
}

type NormalizedValue = 
  | string 
  | number 
  | boolean 
  | null
  | NormalizedValue[]
  | NormalizedObject;

interface NormalizedQuery {
  expressions?: Array<{
    op: string;
    key: string;
    val: NormalizedValue;
  }>;
  ranges?: Array<{
    key: string;
    start: NormalizedValue;
    end: NormalizedValue;
  }>;
  order?: {
    field: string;
    direction: SortDirection;
  };
  or?: NormalizedQuery[];
  and?: NormalizedQuery[];
}

export interface CacheKeyOptions {
  collection: string;
  operation: string;
  query?: ICollectionQuery;
  id?: string;
  pagination?: Pagination;
  additionalParams?: Record<string, unknown>;
}

export class CacheKeyGenerator {
  private static readonly SEPARATOR = ':';
  private static readonly NULL_VALUE = '__null__';
  private static readonly UNDEFINED_VALUE = '__undefined__';
  
  static generate(options: CacheKeyOptions): string {
    const parts: string[] = [
      'flongo',
      options.collection,
      options.operation
    ];
    
    if (options.id) {
      parts.push(options.id);
      return parts.join(this.SEPARATOR);
    }
    
    if (options.query) {
      const queryHash = this.hashQuery(options.query);
      parts.push(queryHash);
    }
    
    if (options.pagination) {
      parts.push(`p${options.pagination.offset}-${options.pagination.count}`);
    }
    
    if (options.additionalParams) {
      const paramsHash = this.hashObject(options.additionalParams);
      parts.push(paramsHash);
    }
    
    return parts.join(this.SEPARATOR);
  }
  
  static generatePattern(collection: string, operation?: string): string {
    const parts: string[] = ['flongo', collection];
    
    if (operation) {
      parts.push(operation);
    }
    
    return parts.join(this.SEPARATOR) + '*';
  }
  
  private static hashQuery(query: ICollectionQuery): string {
    const normalized = this.normalizeQuery(query);
    return this.hash(JSON.stringify(normalized));
  }
  
  private static normalizeQuery(query: ICollectionQuery): NormalizedQuery {
    const normalized: NormalizedQuery = {};
    
    if (query.expressions && query.expressions.length > 0) {
      normalized.expressions = query.expressions
        .map(exp => ({
          op: exp.op || '==',
          key: exp.key,
          val: this.normalizeValue(exp.val)
        }))
        .sort((a, b) => {
          const keyCompare = a.key.localeCompare(b.key);
          if (keyCompare !== 0) return keyCompare;
          const opCompare = a.op.localeCompare(b.op);
          if (opCompare !== 0) return opCompare;
          return String(a.val).localeCompare(String(b.val));
        });
    }
    
    if (query.ranges && query.ranges.length > 0) {
      normalized.ranges = query.ranges
        .map(range => ({
          key: range.key,
          start: this.normalizeValue(range.start),
          end: this.normalizeValue(range.end)
        }))
        .sort((a, b) => a.key.localeCompare(b.key));
    }
    
    if (query.orderField) {
      normalized.order = {
        field: query.orderField,
        direction: query.orderDirection || SortDirection.Ascending
      };
    }
    
    if (query.orQueries && query.orQueries.length > 0) {
      normalized.or = query.orQueries
        .map(q => this.normalizeQuery(q))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    }
    
    if (query.andQueries && query.andQueries.length > 0) {
      normalized.and = query.andQueries
        .map(q => this.normalizeQuery(q))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    }
    
    return normalized;
  }
  
  private static normalizeValue(value: unknown): NormalizedValue {
    if (value === null) {
      return this.NULL_VALUE;
    }
    
    if (value === undefined) {
      return this.UNDEFINED_VALUE;
    }
    
    if (value instanceof Date) {
      return value.toISOString();
    }
    
    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        return value.map(v => this.normalizeValue(v)).sort();
      }
      
      const normalized: NormalizedObject = {};
      const keys = Object.keys(value as Record<string, unknown>).sort();
      
      for (const key of keys) {
        normalized[key] = this.normalizeValue((value as Record<string, unknown>)[key]);
      }
      
      return normalized;
    }
    
    return value as NormalizedValue;
  }
  
  private static hashObject(obj: Record<string, unknown>): string {
    const normalized = this.normalizeValue(obj);
    return this.hash(JSON.stringify(normalized));
  }
  
  private static hash(input: string): string {
    return createHash('sha256')
      .update(input)
      .digest('hex')
      .substring(0, 16);
  }
  
  static parseKey(key: string): {
    collection?: string;
    operation?: string;
    identifier?: string;
  } {
    const parts = key.split(this.SEPARATOR);
    
    if (parts[0] !== 'flongo') {
      return {};
    }
    
    return {
      collection: parts[1],
      operation: parts[2],
      identifier: parts.slice(3).join(this.SEPARATOR)
    };
  }
  
  static isFlongoKey(key: string): boolean {
    return key.startsWith('flongo' + this.SEPARATOR);
  }
  
  static getCollectionFromKey(key: string): string | undefined {
    const parsed = this.parseKey(key);
    return parsed.collection;
  }
  
  static getOperationFromKey(key: string): string | undefined {
    const parsed = this.parseKey(key);
    return parsed.operation;
  }
}