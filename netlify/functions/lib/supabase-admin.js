const { createClient } = require('@supabase/supabase-js');
const { getConfig } = require('./config');

let adminClient;

function getSupabaseAdmin() {
  if (!adminClient) {
    const { supabaseUrl, supabaseServiceRoleKey } = getConfig();
    adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      },
      db: {
        schema: 'app'
      }
    });
  }

  return adminClient;
}

module.exports = {
  getSupabaseAdmin
};
