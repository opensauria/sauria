use serde_json::Value;

pub(crate) fn build_cloud_models(provider: &str) -> Value {
    match provider {
        "anthropic" => serde_json::json!({
            "extraction": {"provider": "google", "model": "gemini-2.5-flash"},
            "reasoning": {"provider": "anthropic", "model": "claude-sonnet-4-5"},
            "deep": {"provider": "anthropic", "model": "claude-opus-4-6"},
            "embeddings": {"provider": "local", "model": "all-MiniLM-L6-v2"}
        }),
        "openai" => serde_json::json!({
            "extraction": {"provider": "openai", "model": "gpt-4o-mini"},
            "reasoning": {"provider": "openai", "model": "gpt-4o"},
            "deep": {"provider": "openai", "model": "gpt-4o"},
            "embeddings": {"provider": "local", "model": "all-MiniLM-L6-v2"}
        }),
        "google" => serde_json::json!({
            "extraction": {"provider": "google", "model": "gemini-2.5-flash"},
            "reasoning": {"provider": "google", "model": "gemini-2.5-pro"},
            "deep": {"provider": "google", "model": "gemini-2.5-pro"},
            "embeddings": {"provider": "local", "model": "all-MiniLM-L6-v2"}
        }),
        _ => build_cloud_models("anthropic"),
    }
}

pub(crate) fn build_local_models(engine: &str, base_url: &str) -> Value {
    if engine == "ollama" {
        return serde_json::json!({
            "extraction": {"provider": "ollama", "model": "llama3.2", "baseUrl": base_url},
            "reasoning": {"provider": "ollama", "model": "llama3.2", "baseUrl": base_url},
            "deep": {"provider": "ollama", "model": "llama3.2", "baseUrl": base_url},
            "embeddings": {"provider": "local", "model": "all-MiniLM-L6-v2"}
        });
    }
    let model = if engine == "lm-studio" { "lm-studio" } else { "default" };
    serde_json::json!({
        "extraction": {"provider": "openai", "model": model, "baseUrl": base_url},
        "reasoning": {"provider": "openai", "model": model, "baseUrl": base_url},
        "deep": {"provider": "openai", "model": model, "baseUrl": base_url},
        "embeddings": {"provider": "local", "model": "all-MiniLM-L6-v2"}
    })
}
