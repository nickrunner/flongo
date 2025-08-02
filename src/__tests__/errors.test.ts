import { describe, it, expect } from 'vitest';
import { Error404, Error400 } from '../errors';

describe('Error Classes', () => {
  describe('Error404', () => {
    it('should create error with default message', () => {
      const error = new Error404();
      
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('Error404');
      expect(error.message).toBe('Not found');
    });

    it('should create error with custom message', () => {
      const customMessage = 'Document with ID 123 not found';
      const error = new Error404(customMessage);
      
      expect(error.name).toBe('Error404');
      expect(error.message).toBe(customMessage);
    });

    it('should have proper stack trace', () => {
      const error = new Error404();
      
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('Error404');
    });

    it('should be catchable as specific error type', () => {
      try {
        throw new Error404('Test error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error404);
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('Error400', () => {
    it('should create error with default message', () => {
      const error = new Error400();
      
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('Error400');
      expect(error.message).toBe('Bad request');
    });

    it('should create error with custom message', () => {
      const customMessage = 'Invalid query parameters';
      const error = new Error400(customMessage);
      
      expect(error.name).toBe('Error400');
      expect(error.message).toBe(customMessage);
    });

    it('should have proper stack trace', () => {
      const error = new Error400();
      
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('Error400');
    });

    it('should be catchable as specific error type', () => {
      try {
        throw new Error400('Test error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error400);
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('Error Differentiation', () => {
    it('should be able to distinguish between error types', () => {
      const error404 = new Error404();
      const error400 = new Error400();
      
      expect(error404).toBeInstanceOf(Error404);
      expect(error404).not.toBeInstanceOf(Error400);
      
      expect(error400).toBeInstanceOf(Error400);
      expect(error400).not.toBeInstanceOf(Error404);
    });

    it('should work with instanceof checks in catch blocks', () => {
      const errors = [
        new Error404('Not found'),
        new Error400('Bad request'),
        new Error('Generic error')
      ];

      errors.forEach(error => {
        try {
          throw error;
        } catch (caught) {
          if (caught instanceof Error404) {
            expect(caught.message).toBe('Not found');
          } else if (caught instanceof Error400) {
            expect(caught.message).toBe('Bad request');
          } else {
            expect(caught.message).toBe('Generic error');
          }
        }
      });
    });
  });
});