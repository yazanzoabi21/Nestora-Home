// Offline syntax checks only; no database client, credentials, or SQL execution.
const fs = require('node:fs');
const path = require('node:path');
const parser = require(process.env.NESTORA_SQL_PARSER || 'libpg-query');

(async () => {
  const report = {
    scope: 'Offline SQL/PLpgSQL parsing. No connection, authorization, ACL/object resolution or rollback execution.',
    files: [],
    dynamicTemplates: [],
  };
  for (const name of fs.readdirSync(__dirname).filter((name) => name.endsWith('.sql')).sort()) {
    const raw = fs.readFileSync(path.join(__dirname, name), 'utf8');
    // psql meta-commands and quoted psql variables are expanded only for grammar checks.
    // Real test execution requires the operator's actual staging fixture identifiers.
    const sql = raw.replace(/^\\.*$/gm, '').replace(/:'[a-z_]+'/g, "'00000000-0000-0000-0000-000000000001'");
    const result = { file: name, psqlPreprocessed: raw !== sql, sqlBodies: 0 };
    try {
      const ast = await parser.parse(sql);
      result.parserVersion = ast.version;
      result.statements = ast.stmts?.length;
      result.sql = 'PASS';
      const pl = await parser.parsePlPgSQL(sql);
      result.plpgsql = 'PASS';
      result.plpgsqlBodies = pl.plpgsql_funcs?.length;
      for (const match of sql.matchAll(/create(?: or replace)? function([\s\S]*?)\bas\s+(\$[a-z_]*\$)([\s\S]*?)\2\s*;/gi)) {
        if (/language sql\b/i.test(match[1])) {
          await parser.parse(match[3]);
          result.sqlBodies++;
        }
      }
    } catch (error) {
      result.error = error.message;
      process.exitCode = 1;
    }
    report.files.push(result);
  }
  for (const command of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
    const predicate = '((select nestora_security_20261116.active_admin()) or (user_id=(select auth.uid()) and (select nestora_security_20261116.active_actor())))';
    const sql = `create policy security_20261116_owner_${command.toLowerCase()} on public.carts as restrictive for ${command} to anon,authenticated ` +
      (['SELECT', 'UPDATE', 'DELETE'].includes(command) ? `using (${predicate}) ` : '') +
      (['INSERT', 'UPDATE'].includes(command) ? `with check (${predicate})` : '');
    await parser.parse(sql);
    report.dynamicTemplates.push({ command, policy: 'PASS' });
  }
  // Dynamic REVOKE grammar is checked independently of PL/pgSQL body parsing.
  for (const sql of [
    'revoke select(id),insert(id),update(id),references(id) on public.profiles from public,anon',
    'revoke insert(id),update(id),references(id) on public.roles from public,anon,authenticated',
  ]) {
    await parser.parse(sql);
    report.dynamicTemplates.push({ sql, parse: 'PASS' });
  }
  fs.writeFileSync(path.join(__dirname, 'SQL_PARSE_REPORT.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
