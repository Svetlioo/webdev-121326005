import { beforeEach, describe, expect, test, vi } from 'vitest';
import { listUsers as listUserRows, setRoleById } from '../../src/data/users';
import { listUsers, setUserRole } from '../../src/services/users';

vi.mock('../../src/data/users', () => ({ listUsers: vi.fn(), setRoleById: vi.fn() }));

const admin = { id: 'a1', role: 'admin' };
const student = { id: 's1', role: 'student' };

beforeEach(() => vi.resetAllMocks());

describe('roles', () => {
  test('AC-21 an admin makes a student an admin; a student who tries gets 403 and the role stays', async () => {
    vi.mocked(setRoleById).mockResolvedValue(true);
    await setUserRole(admin, 's1', 'admin');
    expect(setRoleById).toHaveBeenCalledWith('s1', 'admin');
    vi.mocked(setRoleById).mockClear();
    await expect(setUserRole(student, 's1', 'admin')).rejects.toMatchObject({ status: 403 });
    await expect(setUserRole(null, 's1', 'admin')).rejects.toMatchObject({ status: 401 });
    expect(setRoleById).not.toHaveBeenCalled();
  });

  test('an admin cannot change their own role, or give a role that does not exist', async () => {
    await expect(setUserRole(admin, 'a1', 'student')).rejects.toMatchObject({ status: 400 });
    await expect(setUserRole(admin, 's1', 'publisher')).rejects.toMatchObject({ status: 400 });
    expect(setRoleById).not.toHaveBeenCalled();
  });

  test('an unknown user gives 404', async () => {
    vi.mocked(setRoleById).mockResolvedValue(false);
    await expect(setUserRole(admin, 'nobody', 'admin')).rejects.toMatchObject({ status: 404 });
  });

  test('only an admin lists the users', async () => {
    vi.mocked(listUserRows).mockResolvedValue([]);
    expect(await listUsers(admin)).toEqual([]);
    await expect(listUsers(student)).rejects.toMatchObject({ status: 403 });
  });
});
