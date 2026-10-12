import crypto from 'node:crypto';

export const DELETION_RECEIPT_VERSION='jahorin-deletion-receipt-v1';

async function ensureDeletionReceiptSchema(pool){
  await pool.query(`create table if not exists public.jahorin_deletion_receipts (
    receipt_id uuid primary key,
    gid text not null,
    scope text not null,
    status text not null,
    deleted_rows integer not null default 0,
    systems jsonb not null default '[]'::jsonb,
    backup_status text not null default 'not_attested',
    proof_algorithm text not null,
    proof_hash text not null,
    requested_at timestamptz not null,
    completed_at timestamptz not null,
    created_at timestamptz not null default now()
  )`);
  await pool.query(`create index if not exists jahorin_deletion_receipts_gid_created_idx on public.jahorin_deletion_receipts(gid,created_at desc)`);
}

function proofFor(payload){
  const canonical=JSON.stringify(payload);
  const key=process.env.ARI_DELETION_AUDIT_KEY||process.env.ARI_SESSION_SECRET||process.env.JWT_SECRET||'';
  if(key){
    return {proof_algorithm:'HMAC-SHA256',proof_hash:crypto.createHmac('sha256',key).update(canonical).digest('hex'),attested:true};
  }
  return {proof_algorithm:'SHA256-UNSIGNED',proof_hash:crypto.createHash('sha256').update(canonical).digest('hex'),attested:false};
}

export async function deleteVedicProfileWithReceipt(pool,gid){
  await ensureDeletionReceiptSchema(pool);
  const client=await pool.connect();
  const receiptId=crypto.randomUUID();
  const requestedAt=new Date().toISOString();
  try{
    await client.query('begin');
    const deleted=await client.query('delete from public.jahorin_vedic_profiles where gid=$1 returning gid',[gid]);
    const completedAt=new Date().toISOString();
    const deletedRows=deleted.rowCount||0;
    const status=deletedRows>0?'completed':'no_matching_record';
    const systems=['jahorin_vedic_profiles'];
    const backupStatus='not_attested';
    const proofPayload={receipt_id:receiptId,scope:'vedic_personalization',status,deleted_rows:deletedRows,systems,backup_status:backupStatus,requested_at:requestedAt,completed_at:completedAt,receipt_version:DELETION_RECEIPT_VERSION};
    const proof=proofFor(proofPayload);
    await client.query(`insert into public.jahorin_deletion_receipts(receipt_id,gid,scope,status,deleted_rows,systems,backup_status,proof_algorithm,proof_hash,requested_at,completed_at)
      values($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11)`,[receiptId,String(gid),'vedic_personalization',status,deletedRows,JSON.stringify(systems),backupStatus,proof.proof_algorithm,proof.proof_hash,requestedAt,completedAt]);
    await client.query('commit');
    return {
      deleted:deletedRows>0,
      receipt:{
        ...proofPayload,
        proof_algorithm:proof.proof_algorithm,
        proof_hash:proof.proof_hash,
        server_attested:proof.attested,
        statement:deletedRows>0?'The primary Jahorin Vedic personalization record was deleted.':'No matching primary Jahorin Vedic personalization record existed at deletion time.',
      },
    };
  }catch(error){
    await client.query('rollback').catch(()=>{});
    throw error;
  }finally{
    client.release();
  }
}
