'use client';

import { useAction } from '@/app/imports/actions';

const ROLES = { student: 'Студент', publisher: 'Публикуващ', admin: 'Администратор' };

/** Changes a user's role at once; the server refuses anyone who is not an admin. */
export function RoleSelect({ userId, role, email, disabled }: { userId: string; role: string; email: string; disabled?: boolean }) {
  const { busy, error, run } = useAction();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <select
        defaultValue={role}
        disabled={busy || disabled}
        aria-label={`Роля на ${email}`}
        className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
        onChange={(e) =>
          run(`/api/users/${encodeURIComponent(userId)}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ role: e.target.value }),
          })
        }
      >
        {Object.entries(ROLES).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
