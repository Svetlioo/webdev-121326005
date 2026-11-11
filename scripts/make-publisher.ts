// npm run make-publisher -- someone@example.com
// The only way to become a publisher, so no password or role is ever in the repository.
import { closeDb } from '../src/data/db';
import { setRole } from '../src/data/users';

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error('usage: npm run make-publisher -- someone@example.com');
  if (!(await setRole(email, 'publisher'))) throw new Error(`no user with email ${email}; sign up first`);
  console.log(`${email} is now a publisher`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(closeDb);
