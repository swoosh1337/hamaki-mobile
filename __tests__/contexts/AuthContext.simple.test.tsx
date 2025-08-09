// Mock modules first
jest.mock('../../utils/auth');
jest.mock('../../utils/supabase');
jest.mock('../../utils/notifications');

import { useAuth } from '../../contexts/AuthContext';

// Simple test to see if AuthContext can be imported and used
describe('AuthContext Simple', () => {
  it('should export useAuth hook', () => {
    expect(useAuth).toBeDefined();
  });
});