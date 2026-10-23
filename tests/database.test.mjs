// Run with: node tests/database.test.mjs <path-to-pglite-dist/index.js>
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {PGlite}=await import(pathToFileURL(resolve(process.argv[2])).href);
const db=new PGlite();
await db.exec(`create role anon; create role authenticated; create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
grant usage on schema auth to authenticated,anon;
grant execute on function auth.uid(),auth.jwt() to authenticated,anon;`);
const sql=await readFile(new URL('../cloud/schema.sql',import.meta.url),'utf8');
await db.exec(sql);await db.exec(sql);
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
await db.query('insert into auth.users values ($1),($2)',[a,b]);
async function identity(id,anonymous=true){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[id,JSON.stringify({is_anonymous:anonymous})]);await db.exec('set role authenticated')}
const progress={visited:['site:river'],completed:['river'],active:'river'};
const ev={id:'33333333-3333-4333-8333-333333333333',event_type:'answer',target:'river',payload:{correct:true},occurred_at:new Date().toISOString()};
async function sync(p=progress,events=[ev],epoch=0,reset=false){return (await db.query('select public.sync_learning($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7) as result',['測試','teacher','test',JSON.stringify(p),JSON.stringify(events),epoch,reset])).rows[0].result}
await identity(a);await sync();await sync();
assert.equal((await db.query('select * from learning_events')).rows.length,1);
await identity(b);assert.equal((await db.query('select * from learning_players')).rows.length,0);
await assert.rejects(()=>db.exec("update learning_players set role='teacher'"));
await assert.rejects(()=>db.exec('select * from shenkeng_private.admins'));
assert.equal((await db.query('select is_learning_admin() as value')).rows[0].value,false);
await sync(progress,[]);
await identity(a);const reset=await sync({visited:[],completed:[],active:null},[],0,true);assert.equal(reset.epoch,1);
const stale=await sync();assert.equal(stale.reset_detected,true);assert.deepEqual(stale.progress.completed,[]);
await assert.rejects(()=>sync({...progress,completed:['invented']},[],1));
await db.exec('reset role');await db.query('insert into shenkeng_private.admins values ($1)',[b]);
await identity(b);assert.equal((await db.query('select is_learning_admin() as value')).rows[0].value,false);
await identity(b,false);assert.equal((await db.query('select * from learning_players')).rows.length,2);
await identity(a);await db.exec('select delete_my_learning()');assert.equal((await db.query('select * from learning_events')).rows.length,0);
await identity(b,false);assert.equal((await db.query('select * from learning_players')).rows.length,1);
await db.exec('reset role; set role anon');await assert.rejects(()=>db.exec('select * from learning_players'));await assert.rejects(()=>sync());
await db.close();console.log('PASS: schema rerun, isolation, admin allowlist, event deduplication, reset epochs, validation, deletion and anonymous access.');
