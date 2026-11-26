#!/usr/bin/env python3
"""Optional *private* Telegram alerts for newly discovered, high-fit public jobs.

Only public job metadata is sent. Never sends a resume, personal profile,
account email, or application answers. Secrets must be GitHub Actions secrets.
No bot secrets, URLs containing bot secrets, or API payloads are printed.
"""
from __future__ import annotations
import datetime as dt
import json
import os
from pathlib import Path
import re
import urllib.parse
import urllib.request

FEED=Path(__file__).resolve().parent/'jobs'/'feed.json'


def fit(title, term=''):
    """Mirror NextOffer's *title-only* heuristic; not an employer ATS score."""
    title=(title or '').lower()
    def has(rx): return re.search(rx,title,re.I) is not None
    if has(r'product analytics|product data analy'): value=91
    elif has(r'business intelligence|\bbi\b'): value=91
    elif has(r'data analy|business analy|analytics intern|insights intern|reporting analy'): value=90
    elif has(r'data science|data scientist'): value=83
    elif has(r'product manag'): value=81
    elif has(r'technical program|tpm'): value=81
    elif has(r'project manag|program manag|product operations'): value=77
    elif has(r'operations|strategy|financial analyst|supply chain'): value=73
    else: value=65
    if term=='Spring / off-cycle':value+=3
    return min(98,value)


def age_hours(job, when):
    try:
        stamp=job.get('posted_at') or ''
        if not stamp:return None
        t=dt.datetime.fromisoformat(stamp.replace('Z','+00:00'))
        if t.tzinfo is None:t=t.replace(tzinfo=dt.timezone.utc)
        delta=(when-t).total_seconds()/3600
        return delta if delta>=-0.5 else None
    except (ValueError,TypeError):return None


def urgency(job, when):
    score=fit(job.get('title',''),job.get('term',''))
    age=age_hours(job,when)
    precise=job.get('date_precision') in ('instant','hour')
    if precise and age is not None and 0<=age<=1 and score>=80:
        return (4,'SOURCE REPORTS <1H' if job.get('date_basis')=='source-reported' else 'NEWLY INDEXED <1H',score)
    if precise and age is not None and 0<=age<=24 and score>=82:
        return (3,'REPORTED <24H',score)
    if age is not None and 0<=age<=72 and score>=90:
        basis=job.get('date_basis','')
        return (2,'RECENT BOARD DATE' if basis.startswith('board') else 'POSTED <3D',score)
    if age is None and score>=90:
        # No posted date: alert as newly discovered, not newly posted.
        return (1,'DATE UNKNOWN / NEW TO FEED',score)
    return None


def candidates(feed, now=None):
    now=now or dt.datetime.now(dt.timezone.utc)
    new=set(feed.get('new_ids',[]))
    if not new:return []
    jobs=[]
    for job in feed.get('jobs',[]):
        if job.get('id') not in new or job.get('stale'):continue
        status=urgency(job,now)
        if status and (job.get('url') or '').startswith('https://'):
            jobs.append((status,job))
    return sorted(jobs,key=lambda pair:(pair[0][0],pair[0][2]),reverse=True)


def main():
    feed=json.loads(FEED.read_text())
    selected=candidates(feed)
    print(f'New high-fit alerts this scan: {len(selected)} (from {feed.get("new_count",0)} newly indexed jobs)')
    token=os.environ.get('NEXTOFFER_TELEGRAM_BOT_TOKEN','').strip()
    chat=os.environ.get('NEXTOFFER_TELEGRAM_CHAT_ID','').strip()
    if not token or not chat:
        print('Telegram notifications are disabled until both GitHub Actions secrets are added.')
        return 0
    if not selected:return 0
    top=selected[:7]
    lines=['🚀 NextOffer — new high-fit internship matches',
           'Title-based match estimates, not ATS scores. Check eligibility and posting status.','']
    for (priority,label,score),job in top:
        # Keep raw URLs as provided by the source; message is plain text, not HTML.
        lines.append(f'{label} | {score}/100 | {job.get("company","")} — {job.get("title","")}')
        lines.append(str(job.get('url','')))
        lines.append('')
    if len(selected)>len(top):lines.append(f'+{len(selected)-len(top)} more in your NextOffer queue.')
    lines.append('Open: https://harshini118.github.io/internshiptracker/')
    payload=urllib.parse.urlencode({'chat_id':chat,'text':'\n'.join(lines),'disable_web_page_preview':'true'}).encode()
    req=urllib.request.Request('https://api.telegram.org/bot'+token+'/sendMessage',data=payload,headers={'User-Agent':'NextOffer-alerts/2','Content-Type':'application/x-www-form-urlencoded'})
    try:
        # Never print the exception: the API URL includes the private bot token.
        with urllib.request.urlopen(req,timeout=15) as resp:
            body=json.loads(resp.read(2048))
            print('Telegram notification delivered.' if body.get('ok') else 'Telegram notification was rejected; review bot setup.')
    except Exception:
        print('Telegram notification failed. Check bot token, chat ID and bot-start step. No secrets printed.')
    return 0


if __name__=='__main__':raise SystemExit(main())
