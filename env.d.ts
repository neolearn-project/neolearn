declare namespace NodeJS {
  interface ProcessEnv {
    NEXT_PUBLIC_SUPABASE_URL: string;
    SUPABASE_SERVICE_ROLE: string;
    WA_ACCESS_TOKEN: string;
    WA_PHONE_NUMBER_ID: string;
  }
}