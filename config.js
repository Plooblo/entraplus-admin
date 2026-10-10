// EntraPlus admin panel settings. The same Supabase project as the website.
// The publishable (anon) key is public by design: the admin function checks who you are on every request.
window.ADMIN_CONFIG = {
  supabaseUrl: "https://kqtgpazijcbssmzeazod.supabase.co",
  supabaseAnonKey: "PASTE_THE_SAME_PUBLISHABLE_KEY_AS_THE_WEBSITE",
  mock: false            // true = try the panel with made-up data, no sign-in (for previewing only)
};
