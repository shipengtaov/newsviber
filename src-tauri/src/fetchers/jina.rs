use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::error::Error;

#[derive(Debug, Deserialize, Serialize)]
pub struct JinaResponseData {
    pub code: i32,
    pub status: i32,
    pub data: JinaResponse,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct JinaResponse {
    pub title: String,
    pub description: Option<String>,
    pub url: String,
    pub content: String,
}

// Fetch a URL's content using Jina API (r.jina.ai)
pub async fn fetch_jina_url(url: &str, api_key: Option<&str>) -> Result<JinaResponse, Box<dyn Error>> {
    let jina_url = format!("https://r.jina.ai/{}", url);
    let mut request = Client::new().get(&jina_url)
        .header("Accept", "application/json");

    if let Some(key) = api_key {
        if !key.trim().is_empty() {
            request = request.header("Authorization", format!("Bearer {}", key));
        }
    }

    let res = request.send().await?;
    if !res.status().is_success() {
        return Err(format!("Jina API returned status: {}", res.status()).into());
    }

    let json: JinaResponseData = res.json().await?;
    Ok(json.data)
}

// Search using Jina API (s.jina.ai)
pub async fn fetch_jina_search(query: &str, api_key: Option<&str>) -> Result<JinaResponse, Box<dyn Error>> {
    // Note: s.jina.ai usually returns markdown text instead of a JSON data envelope.
    // It can return a list of markdown references. To get JSON we need Accept header.
    let jina_url = format!("https://s.jina.ai/{}", query);
    let mut request = Client::new().get(&jina_url)
        .header("Accept", "application/json");

    if let Some(key) = api_key {
        if !key.trim().is_empty() {
            request = request.header("Authorization", format!("Bearer {}", key));
        }
    }

    let res = request.send().await?;
    if !res.status().is_success() {
        return Err(format!("Jina API returned status: {}", res.status()).into());
    }

    let json: JinaResponseData = res.json().await?;
    Ok(json.data)
}
