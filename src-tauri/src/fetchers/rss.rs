use atom_syndication::{Entry, Feed};
use reqwest::{header::CONTENT_TYPE, Client, StatusCode};
use rss::Channel;
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::io;

const RSS_USER_AGENT: &str = "News Viber/26.3.2 (Tauri RSS Fetcher)";

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
    let client = Client::builder().user_agent(RSS_USER_AGENT).build()?;

    let response = client.get(url).send().await?;
    let status = response.status();
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_string();

    if !status.is_success() {
        let message = format!(
            "failed to fetch feed from {url}: HTTP {status} (content-type: {})",
            display_content_type(&content_type)
        );
        return Err(io::Error::new(io::ErrorKind::Other, message).into());
    }

    let content = response.bytes().await?;
    parse_feed_document(url, status, &content_type, content.as_ref())
        .map_err(|message| io::Error::new(io::ErrorKind::Other, message).into())
}

fn parse_feed_document(
    url: &str,
    status: StatusCode,
    content_type: &str,
    content: &[u8],
) -> Result<Vec<ParsedArticle>, String> {
    let prefer_atom = content_type.to_ascii_lowercase().contains("atom+xml");

    if prefer_atom {
        match parse_atom_feed(content) {
            Ok(articles) => Ok(articles),
            Err(atom_error) => match parse_rss_feed(content) {
                Ok(articles) => Ok(articles),
                Err(rss_error) => Err(build_parse_error(
                    url,
                    status,
                    content_type,
                    &rss_error,
                    &atom_error,
                )),
            },
        }
    } else {
        match parse_rss_feed(content) {
            Ok(articles) => Ok(articles),
            Err(rss_error) => match parse_atom_feed(content) {
                Ok(articles) => Ok(articles),
                Err(atom_error) => Err(build_parse_error(
                    url,
                    status,
                    content_type,
                    &rss_error,
                    &atom_error,
                )),
            },
        }
    }
}

fn parse_rss_feed(content: &[u8]) -> Result<Vec<ParsedArticle>, String> {
    let channel = Channel::read_from(content).map_err(|error| error.to_string())?;

    Ok(channel
        .items()
        .iter()
        .map(|item| ParsedArticle {
            title: item.title().unwrap_or("No Title").to_string(),
            link: item.link().unwrap_or("").to_string(),
            description: item.description().unwrap_or("").to_string(),
            content: item.content().unwrap_or("").to_string(),
            pub_date: item.pub_date().unwrap_or("").to_string(),
            author: item.author().unwrap_or("").to_string(),
        })
        .collect())
}

fn parse_atom_feed(content: &[u8]) -> Result<Vec<ParsedArticle>, String> {
    let feed = Feed::read_from(content).map_err(|error| error.to_string())?;
    Ok(feed.entries().iter().map(map_atom_entry).collect())
}

fn map_atom_entry(entry: &Entry) -> ParsedArticle {
    let description = entry
        .summary()
        .map(|summary| summary.as_str().to_string())
        .unwrap_or_default();
    let content = entry
        .content()
        .and_then(|value| value.value())
        .map(ToString::to_string)
        .unwrap_or_else(|| description.clone());
    let pub_date = entry
        .published()
        .map(|published| published.to_rfc3339())
        .unwrap_or_else(|| entry.updated().to_rfc3339());
    let author = entry
        .authors()
        .first()
        .map(|person| person.name().to_string())
        .unwrap_or_default();
    let link = entry
        .links()
        .iter()
        .find(|link| link.rel() == "alternate")
        .or_else(|| entry.links().first())
        .map(|link| link.href().to_string())
        .unwrap_or_default();

    ParsedArticle {
        title: entry.title().as_str().to_string(),
        link,
        description,
        content,
        pub_date,
        author,
    }
}

fn build_parse_error(
    url: &str,
    status: StatusCode,
    content_type: &str,
    rss_error: &str,
    atom_error: &str,
) -> String {
    format!(
        "failed to parse feed from {url} (status: {status}, content-type: {}): rss parse error: {rss_error}; atom parse error: {atom_error}",
        display_content_type(content_type)
    )
}

fn display_content_type(content_type: &str) -> &str {
    if content_type.trim().is_empty() {
        "<unknown>"
    } else {
        content_type
    }
}

#[cfg(test)]
mod tests {
    use super::parse_feed_document;
    use reqwest::StatusCode;

    const RSS_FIXTURE: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Example RSS Feed</title>
    <link>https://example.com</link>
    <description>Example Description</description>
    <item>
      <title>RSS Article</title>
      <link>https://example.com/rss-article</link>
      <description>RSS Summary</description>
      <content:encoded xmlns:content="http://purl.org/rss/1.0/modules/content/">&lt;p&gt;RSS Content&lt;/p&gt;</content:encoded>
      <pubDate>Fri, 13 Mar 2026 06:30:37 GMT</pubDate>
      <author>rss@example.com</author>
    </item>
  </channel>
</rss>"#;

    const ATOM_FIXTURE: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Atom Feed</title>
  <id>urn:uuid:feed-1</id>
  <updated>2026-03-13T06:30:37Z</updated>
  <entry>
    <title>Atom Article</title>
    <link rel="self" href="https://example.com/atom-article.xml" />
    <link rel="alternate" href="https://example.com/atom-article" />
    <id>urn:uuid:entry-1</id>
    <updated>2026-03-13T06:30:37Z</updated>
    <published>2026-03-12T01:02:03Z</published>
    <summary>Atom Summary</summary>
    <content type="html">&lt;p&gt;Atom Content&lt;/p&gt;</content>
    <author>
      <name>Jane Doe</name>
    </author>
  </entry>
</feed>"#;

    const INVALID_FIXTURE: &str = "<html><body>Not a feed</body></html>";

    #[test]
    fn parses_rss_fixture() {
        let articles = parse_feed_document(
            "https://example.com/rss",
            StatusCode::OK,
            "application/rss+xml",
            RSS_FIXTURE.as_bytes(),
        )
        .expect("rss fixture should parse");

        assert_eq!(articles.len(), 1);
        assert_eq!(articles[0].title, "RSS Article");
        assert_eq!(articles[0].link, "https://example.com/rss-article");
        assert_eq!(articles[0].description, "RSS Summary");
        assert_eq!(articles[0].content, "<p>RSS Content</p>");
        assert_eq!(articles[0].pub_date, "Fri, 13 Mar 2026 06:30:37 GMT");
        assert_eq!(articles[0].author, "rss@example.com");
    }

    #[test]
    fn parses_atom_fixture() {
        let articles = parse_feed_document(
            "https://example.com/atom",
            StatusCode::OK,
            "application/atom+xml; charset=utf-8",
            ATOM_FIXTURE.as_bytes(),
        )
        .expect("atom fixture should parse");

        assert_eq!(articles.len(), 1);
        assert_eq!(articles[0].title, "Atom Article");
        assert_eq!(articles[0].link, "https://example.com/atom-article");
        assert_eq!(articles[0].description, "Atom Summary");
        assert_eq!(articles[0].content, "<p>Atom Content</p>");
        assert_eq!(articles[0].pub_date, "2026-03-12T01:02:03+00:00");
        assert_eq!(articles[0].author, "Jane Doe");
    }

    #[test]
    fn reports_rss_and_atom_parse_errors_for_invalid_content() {
        let error = parse_feed_document(
            "https://example.com/invalid",
            StatusCode::OK,
            "text/html",
            INVALID_FIXTURE.as_bytes(),
        )
        .expect_err("invalid fixture should fail");

        assert!(error.contains("https://example.com/invalid"));
        assert!(error.contains("status: 200 OK"));
        assert!(error.contains("content-type: text/html"));
        assert!(error.contains("rss parse error:"));
        assert!(error.contains("atom parse error:"));
    }
}
