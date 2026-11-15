# Website validation

- Prefer the local managed preview for browser checks.
- When opening the production guide for automated or cloud-browser validation, use `?exclude_self=once` before the hash. Keep this parameter through refreshes and navigation. Never validate through an ordinary production URL.
- Do not send synthetic capture events to production. Use the local test harness for pageview and dwell checks.
- A cloud network, Chrome, Windows, or `webdriver=false` does not prove a human or a bot. Keep uncertain historical records and label the uncertainty.
- Do not commit visitor records, full visitor IPs, private report queries, credentials, or session state. Keep maintenance notes out of the guide UI.
- Do not display assistant query, review, update, or maintenance timestamps in the guide or downloadable indexes. Preserve original post dates, policy dates, deadlines, and actual visit times. After historical data merges, run `python data/hide_work_dates_20261115.py` before refreshing downloadable indexes.
