use reqwest::Client;
use rss::Channel;
use std::error::Error;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedArticle {
    pub title: String,
    pub link: String,
    pub description: String,
    pub content: String,
    pub pub_date: String,
    pub author: String,
}

pub async fn fetch_rss(url: &str) -> Result<Vec<ParsedArticle>, Box<dyn Error>> {
    let client = Client::builder()
        .user_agent("GetNews/1.0 (Tauri RSS Fetcher)")
        .build()?;
    
    let content = client.get(url).send().await?.bytes().await?;
    let channel = Channel::read_from(&content[..])?;
    
    let mut articles = Vec::new();
    for item in channel.items() {
        articles.push(ParsedArticle {
            title: item.title().unwrap_or("No Title").to_string(),
            link: item.link().unwrap_or("").to_string(),
            description: item.description().unwrap_or("").to_string(),
            content: item.content().unwrap_or("").to_string(),
            pub_date: item.pub_date().unwrap_or("").to_string(),
            author: item.author().unwrap_or("").to_string(),
        });
    }
    
    Ok(articles)
}
