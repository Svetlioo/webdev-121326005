#!/bin/sh
# Signs a STUDENT in on the live site and writes only their session token into .env.live as MCP_TOKEN
# (.env.live is ignored by git). The password is asked for without echo and never stored or passed as an
# argument, so it is not in the shell history or the process list. The MCP server refuses an admin's token.
#   npm run mcp:token:live
cd "$(dirname "$0")/.." || exit 1
URL=https://tu-programa.onrender.com
printf 'Student e-mail on the live site: '; read -r EMAIL
printf 'Password (not shown): '; stty -echo; read -r PASSWORD; stty echo; echo
BODY=$(EMAIL="$EMAIL" PASSWORD="$PASSWORD" node -e 'process.stdout.write(JSON.stringify({ email: process.env.EMAIL, password: process.env.PASSWORD }))')
unset PASSWORD
TOKEN=$(printf '%s' "$BODY" | curl -s -X POST "$URL/api/auth/sign-in/email" -H 'content-type: application/json' -H "origin: $URL" --data-binary @- \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).token ?? ""')
unset BODY
[ -n "$TOKEN" ] && [ "$TOKEN" != "undefined" ] || { echo "Sign-in failed: check the e-mail and password."; exit 1; }
touch .env.live && chmod 600 .env.live
if grep -q '^MCP_TOKEN=' .env.live; then sed -i '' "s|^MCP_TOKEN=.*|MCP_TOKEN=$TOKEN|" .env.live; else echo "MCP_TOKEN=$TOKEN" >> .env.live; fi
echo "MCP_TOKEN for $EMAIL is in .env.live (the password is not stored). In Claude Code: /mcp → tu-programa → Reconnect."
