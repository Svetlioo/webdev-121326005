// npm run make-admin -- someone@example.com
// The only way to become the first admin; after that, admins give roles on the Users page.
import { closeDb } from '../src/data/db';
import { setRole } from '../src/data/users';

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error('usage: npm run make-admin -- someone@example.com');
  if (!(await setRole(email, 'admin'))) throw new Error(`no user with email ${email}; sign up first`);
  console.log(`${email} is now an admin`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(closeDb);
