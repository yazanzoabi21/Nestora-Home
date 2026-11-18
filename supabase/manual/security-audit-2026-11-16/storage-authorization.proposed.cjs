// STAGING ONLY. Prepared but never executed during the audit.
// Uses operator-selected real image/video files; uploads are not transactional.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('node:crypto');

async function main() {
  const configPath = path.resolve(process.argv[2] || '');
  const inbox = path.resolve(__dirname, 'deployed-metadata') + path.sep;
  assert(configPath.startsWith(inbox), 'Keep credential configuration inside the Git-ignored inbox');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.equal(config.stagingExecutionApproved, true, 'Explicit staging test execution approval required');
  const url = new URL(config.supabaseUrl);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.origin, `https://${config.expectedProjectRef}.supabase.co`);
  assert.equal(url.pathname, '/');
  // Refuse the application environment's project, even if called staging in config.
  for (const name of ['environment.ts','environment.prod.ts']) {
    const source = fs.readFileSync(path.resolve(__dirname, '../../../src/environments', name), 'utf8');
    assert(!source.includes(url.origin), 'Refusing application project: use an isolated approved staging clone');
  }
  const options = (token) => ({
    auth: { persistSession:false, autoRefreshToken:false, detectSessionInUrl:false },
    global: token ? { headers: { Authorization:`Bearer ${token}` } } : {},
  });
  const guest = createClient(url.origin, config.publishableKey, options());
  const actors = {guest};
  for (const name of ['customer','admin','inactiveAdmin']) {
    const actor = config.actors[name];
    assert(actor && typeof actor.token==='string' && typeof actor.id==='string');
    const client = createClient(url.origin, config.publishableKey, options(actor.token));
    const { data:userData, error:userError } = await client.auth.getUser(actor.token);
    assert(!userError && userData.user?.id===actor.id, 'Valid signed staging JWT required: ' + name);
    const { data:profile, error:profileError } = await client.from('profiles')
      .select('id,is_active,roles(name)').eq('id', actor.id).single();
    assert(!profileError && profile, 'Readable real profile required: ' + name);
    const role = Array.isArray(profile.roles) ? profile.roles[0]?.name : profile.roles?.name;
    assert.equal(profile.is_active, name!=='inactiveAdmin');
    assert(name==='customer' ? role==='customer' : ['admin','super_admin'].includes(role), 'Unexpected fixture role');
    actors[name] = client;
  }
  assert.equal(new Set(Object.values(config.actors).map((a)=>a.id)).size,3);
  const image = fs.readFileSync(config.imageFile);
  const video = fs.readFileSync(config.videoFile);
  assert(image.length>8 && image.length<=5*1024*1024 && image.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])), 'Select an existing PNG image <=5MB');
  assert(video.length>12 && video.length<=50*1024*1024 && video.subarray(4,8).toString()==='ftyp', 'Select an existing MP4 <=50MB');
  const prefix = `security-audit/${randomUUID()}`;
  const cleanup = new Map();
  const remember = (bucket,key,client=actors.admin) => {
    const record = cleanup.get(client) || new Map();
    const keys = record.get(bucket) || new Set(); keys.add(key); record.set(bucket,keys); cleanup.set(client,record);
    return key;
  };
  const pass = (label) => console.log('PASS: ' + label);
  const deny = (result,label) => {
    // Only authorization errors count. Network, missing-object/MIME and JWT errors fail.
    assert(result.error && ['403','42501'].includes(String(result.error.statusCode ?? result.error.status)), 'Expected authorization denial: ' + label);
    pass(label);
  };
  const exists = async (bucket,key) => {
    const {error} = await actors.admin.storage.from(bucket).info(key);
    assert(!error, 'Seeded object must remain present');
  };
  let failure;
  try {
    for (const bucket of ['media-library','product-images','product-videos']) {
      const isVideo = bucket==='product-videos';
      const bytes = isVideo ? video : image, contentType = isVideo ? 'video/mp4' : 'image/png';
      const key = remember(bucket, `${prefix}/asset.${isVideo?'mp4':'png'}`);
      assert(!(await actors.admin.storage.from(bucket).upload(key,bytes,{contentType,upsert:false})).error, 'Active Admin seed upload must succeed');
      pass('active Admin upload ' + bucket);
      const publicUrl = guest.storage.from(bucket).getPublicUrl(key).data.publicUrl;
      const read = await fetch(publicUrl,{headers:{'Cache-Control':'no-cache'},redirect:'error'});
      assert(read.ok && Buffer.from(await read.arrayBuffer()).equals(bytes), 'Guest public media read must remain intact');
      pass('Guest public read ' + bucket);
      for (const name of ['guest','customer','inactiveAdmin']) {
        const api = actors[name].storage.from(bucket);
        const candidate = remember(bucket,`${prefix}/${name}.${isVideo?'mp4':'png'}`);
        deny(await api.upload(candidate,bytes,{contentType,upsert:false}), `${name} INSERT ${bucket}`);
        deny(await api.update(key,bytes,{contentType}), `${name} UPDATE ${bucket}`);
        deny(await api.upload(key,bytes,{contentType,upsert:true}), `${name} UPSERT ${bucket}`);
        deny(await api.copy(key,candidate), `${name} COPY ${bucket}`);
        deny(await api.move(key,candidate), `${name} MOVE ${bucket}`);
        const deletion = await api.remove([key,candidate]);
        if (deletion.error) deny(deletion,`${name} DELETE ${bucket}`);
        else { assert(Array.isArray(deletion.data) && deletion.data.length===0, 'Unauthorized delete returned a deleted object'); pass(`${name} DELETE ${bucket} (zero objects)`); }
        await exists(bucket,key);
      }
      // Deployed product-videos has no object UPDATE policy and its client uses
      // upload/remove plus row updates. Preserve that baseline permission set.
      if (!isVideo) {
        assert(!(await actors.admin.storage.from(bucket).update(key,bytes,{contentType})).error, 'Active Admin Storage update must succeed');
        pass('active Admin update ' + bucket);
      }
    }
    for (const name of ['customer','admin']) {
      const id = config.actors[name].id;
      const key = remember('avatars',`${id}/${prefix}/avatar.png`,actors[name]);
      assert(!(await actors[name].storage.from('avatars').upload(key,image,{contentType:'image/png',upsert:false})).error, 'Own avatar upload must succeed');
      assert(!(await actors[name].storage.from('avatars').update(key,image,{contentType:'image/png'})).error, 'Own avatar update must succeed');
      pass(name + ' own avatar upload/update');
      const other = name==='customer' ? actors.admin : actors.customer;
      deny(await other.storage.from('avatars').update(key,image,{contentType:'image/png'}), 'foreign avatar update');
      const foreign = remember('avatars',`${id}/${prefix}/foreign.png`,actors[name]);
      deny(await other.storage.from('avatars').upload(foreign,image,{contentType:'image/png'}), 'foreign avatar upload');
      const deletion = await other.storage.from('avatars').remove([key]);
      if (deletion.error) deny(deletion,'foreign avatar delete');
      else assert(Array.isArray(deletion.data) && deletion.data.length===0, 'Foreign avatar deletion succeeded');
      const otherName = name==='customer' ? 'admin' : 'customer';
      const movedKey = remember('avatars',`${config.actors[otherName].id}/${prefix}/moved.png`,other);
      deny(await actors[name].storage.from('avatars').move(key,movedKey), 'avatar move into foreign UUID folder');
      assert(!(await actors[name].storage.from('avatars').info(key)).error, 'Own avatar must survive foreign mutations');
      if (name==='customer') {
        const catalogKey = remember('product-images',`${prefix}/customer-avatar.png`);
        deny(await actors.customer.storage.from('avatars').copy(key,catalogKey,{destinationBucket:'product-images'}), 'Customer cross-bucket catalog copy');
        deny(await actors.customer.storage.from('avatars').move(key,catalogKey,{destinationBucket:'product-images'}), 'Customer cross-bucket catalog move');
      }
      const read = await fetch(guest.storage.from('avatars').getPublicUrl(key).data.publicUrl,{redirect:'error'});
      assert(read.ok, 'Current public avatar reads must remain intact');
    }
  } catch (error) { failure = error; }
  // Remove only this run's randomly isolated objects, including unexpected writes.
  for (const [client,buckets] of cleanup) for (const [bucket,keys] of buckets) {
    const result = await client.storage.from(bucket).remove([...keys]);
    if (result.error) { console.error('FAIL: staging cleanup requires operator review for ' + bucket); failure ||= new Error('Cleanup failed'); }
    // Verify authorized positive DELETE and that no registered path remains.
    const listed = await client.storage.from(bucket).list(bucket==='avatars' ? `${config.actors[client===actors.customer?'customer':'admin'].id}/${prefix}` : prefix);
    if (listed.error || listed.data?.length) failure ||= new Error('Staging cleanup verification failed');
  }
  if (failure) throw failure;
  console.log('PASS: staging Storage matrix and cleanup; no production project was used');
}
main().catch((error)=>{console.error('FAIL: '+error.message);process.exitCode=1;});
