const RESEND_API_KEY: &str = env!("RESEND_API_KEY");
const RESEND_FROM: &str = "AyahLab Feedback <no-reply@ayahlab.com>";
const RESEND_TO: &str = "ayahlabteam@gmail.com";

#[tauri::command]
pub async fn send_feedback(
    subject: String,
    message: String,
    from_email: Option<String>,
    is_pro: bool,
) -> Result<(), String> {
    let body_text = match &from_email {
        Some(e) if !e.is_empty() => format!("From: {e}\n\n{message}"),
        _ => message.clone(),
    };

    let tier = if is_pro { "Pro" } else { "Free" };

    let mut payload = serde_json::json!({
        "from":    RESEND_FROM,
        "to":      [RESEND_TO],
        "subject": format!("[AyahLab Feedback] [{tier}] {subject}"),
        "text":    body_text,
    });
    if let Some(e) = &from_email {
        if !e.is_empty() {
            payload["reply_to"] = serde_json::Value::String(e.clone());
        }
    }

    let client = reqwest::Client::new();
    let res = client
        .post("https://api.resend.com/emails")
        .header("Authorization", format!("Bearer {RESEND_API_KEY}"))
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        Ok(())
    } else {
        let status = res.status().as_u16();
        let body: serde_json::Value = res.json().await.unwrap_or_default();
        let msg = body["message"].as_str().unwrap_or("Unknown error");
        Err(format!("Error {status}: {msg}"))
    }
}
