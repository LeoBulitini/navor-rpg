// O app só abre uma janela com o build web (apps/web/dist). Toda a lógica e o acesso ao
// Supabase são os mesmos do navegador; não há dados locais nem comandos nativos.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Navor");
}
