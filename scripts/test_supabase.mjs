import { createClient } from '@supabase/supabase-js';

const url = 'https://uujzmevrhuucabhuobim.supabase.co';
const key = 'sb_publishable_pwj2lZkixhR1SP22Q_r2Mg_M3Np-9sJ';

const supabase = createClient(url, key);

async function check() {
  console.log('Testing Supabase connection...');
  
  // 1. Check select on measurement_sheets
  const { data: sheets, error: selError } = await supabase
    .from('measurement_sheets')
    .select('id, sheet_name, user_id')
    .limit(1);

  console.log('Select result:', { sheets, selError });

  // 2. Test insert
  const testId = '00000000-0000-0000-0000-000000000099';
  const { error: insError } = await supabase
    .from('measurement_sheets')
    .upsert({
      id: testId,
      sheet_name: 'Test Sheet',
      user_id: '00000000-0000-0000-0000-000000000001',
      total_entries: 0,
      total_pieces: 0,
      total_cft: 0,
      total_sqft: 0
    });

  console.log('Insert test with dummy UUID:', insError);

  // 3. Test insert with null user_id
  const { error: insNullError } = await supabase
    .from('measurement_sheets')
    .upsert({
      id: testId,
      sheet_name: 'Test Sheet Null',
      user_id: null,
      total_entries: 0,
      total_pieces: 0,
      total_cft: 0,
      total_sqft: 0
    });

  console.log('Insert test with null user_id:', insNullError);

  // 4. Test anonymous sign in
  const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
  console.log('signInAnonymously:', { anonData: anonData?.user?.id, anonError });
}

check().catch(console.error);
