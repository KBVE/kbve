import { isULID, _isULID } from './utility';
import { ULIDValidationError } from './error/ULIDValidationError';

describe('isULID', () => {
    it('should return true for a valid ULID', () => {
      expect(isULID('01J0G6DDCE7Q4JKW8WXC87DPZ7')).toBe(true);
    });
  
    it('should throw an error for a ULID that is too short', () => {
      expect(() => isULID('01J0G6DDCE7Q4JKW8WXC87D')).toThrow(ULIDValidationError);
      expect(() => isULID('01J0G6DDCE7Q4JKW8WXC87D')).toThrow('Invalid length: ULID must be exactly 26 characters long, but got 25.');
    });
  
    it('should throw an error for a ULID that is too long', () => {
      expect(() => isULID('01J0G6DDCE7Q4JKW8WXC87DPZ7X')).toThrow(ULIDValidationError);
      expect(() => isULID('01J0G6DDCE7Q4JKW8WXC87DPZ7X')).toThrow('Invalid length: ULID must be exactly 26 characters long, but got 27.');
    });
  
    it('should throw an error for a ULID with invalid characters', () => {
      expect(() => isULID('01J0G6DDCE7Q4JKW8WXC87DPZ!')).toThrow(ULIDValidationError);
      expect(() => isULID('01J0G6DDCE7Q4JKW8WXC87DPZ!')).toThrow('Invalid format: ULID contains invalid characters.');
    });
  });

  describe('_isULID', () => {
    it('should return true for a valid ULID', () => {
      expect(_isULID('01J0G6DDCE7Q4JKW8WXC87DPZ7')).toEqual({ isValid: true, error: null });
    });
  
    it('should return an error for a ULID that is too short', () => {
      expect(_isULID('01J0G6DDCE7Q4JKW8WXC87D')).toEqual({
        isValid: false,
        error: 'Invalid length: ULID must be exactly 26 characters long, but got 25.'
      });
    });
  
    it('should return an error for a ULID that is too long', () => {
      expect(_isULID('01J0G6DDCE7Q4JKW8WXC87DPZ7X')).toEqual({
        isValid: false,
        error: 'Invalid length: ULID must be exactly 26 characters long, but got 27.'
      });
    });
  
    it('should return an error for a ULID with invalid characters', () => {
      expect(_isULID('01J0G6DDCE7Q4JKW8WXC87DPZ!')).toEqual({
        isValid: false,
        error: 'Invalid format: ULID contains invalid characters.'
      });
    });
  });