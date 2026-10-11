// EntraPlus admin panel settings. The same Supabase project as the website.
// The publishable (anon) key is public by design: the admin function checks who you are on every request.
window.ADMIN_CONFIG = {
  supabaseUrl: "https://kqtgpazijcbssmzeazod.supabase.co",
  supabaseAnonKey: "sb_publishable_F1lglI5wia1vXpzZ9gMUTA_K7QQ_UhN",
  mock: false            // true = try the panel with made-up data, no sign-in (for previewing only)
};
