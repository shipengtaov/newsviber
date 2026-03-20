//! Custom Scraper logic using CSS selectors
use scraper::{Html, Selector};
use reqwest::Client;
use std::error::Error;

pub async fn scrape_custom(url: &str, list_selector: &str, title_selector: &str, link_selector: &str) -> Result<Vec<super::rss::ParsedArticle>, Box<dyn Error>> {
    let client = Client::builder()
        .user_agent("News Viber/26.3.0 (Custom Scraper)")
        .build()?;
    
    let html_content = client.get(url).send().await?.text().await?;
    let document = Html::parse_document(&html_content);
    
    let mut articles = Vec::new();

    if list_selector.is_empty() {
        return Ok(articles);
    }

    if let Ok(item_sel) = Selector::parse(list_selector) {
        for element in document.select(&item_sel) {
            let title = if let Ok(ts) = Selector::parse(title_selector) {
                element.select(&ts).map(|e| e.text().collect::<Vec<_>>().join(" ")).next().unwrap_or_default()
            } else {
                String::new()
            };

            let link = if let Ok(ls) = Selector::parse(link_selector) {
                element.select(&ls).map(|e| e.value().attr("href").unwrap_or("").to_string()).next().unwrap_or_default()
            } else {
                String::new()
            };

            if !title.is_empty() || !link.is_empty() {
                articles.push(super::rss::ParsedArticle {
                    title: title.trim().to_string(),
                    link: link.trim().to_string(),
                    description: String::new(),
                    content: String::new(),
                    pub_date: String::new(),
                    author: String::new(),
                });
            }
        }
    }

    Ok(articles)
}
