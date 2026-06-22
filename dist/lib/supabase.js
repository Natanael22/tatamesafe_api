"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabaseVault = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Usamos a service_role key para o backend ter acesso total (bypassa RLS)
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
    db: {
        // Aponta para o schema público tatame (as tabelas ficam em tatame.*)
        schema: 'tatame',
    },
});
exports.default = supabase;
// Cliente secundário para acessar o schema tatame_vault (denúncias)
exports.supabaseVault = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
    db: {
        schema: 'tatame_vault',
    },
});
