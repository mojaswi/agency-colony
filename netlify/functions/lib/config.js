const IST_TIME_ZONE = 'Asia/Kolkata';

function getConfig() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL environment variable.');
  }

  if (!supabaseServiceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable.');
  }

  return {
    supabaseUrl,
    supabaseServiceRoleKey,
    resendApiKey: process.env.RESEND_API_KEY || '',
    emailSender: process.env.EMAIL_SENDER || 'noreply@youragency.com',
    appBaseUrl: process.env.APP_BASE_URL || 'https://colony.youragency.com'
  };
}

function formatDateInIST(dateInput) {
  const value = dateInput ? new Date(dateInput) : new Date();
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIME_ZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(value);
}

function formatDateTimeInIST(dateInput) {
  const value = dateInput ? new Date(dateInput) : new Date();
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIME_ZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(value);
}

module.exports = {
  IST_TIME_ZONE,
  getConfig,
  formatDateInIST,
  formatDateTimeInIST
};
