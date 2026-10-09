// Checks the scam rules against realistic messages. Runs without an API key (code rules only).
import assert from 'node:assert/strict';
delete process.env.ANTHROPIC_API_KEY;
const { runRules, checkMessage } = await import('../check.js');

const church = {
  name: 'Grace Fellowship Church', city: 'Norfolk, VA', office_phone: '757-555-0100', office_email: 'office@gracefellowship.org',
  leader_title: 'Pastor',
  staff: [
    { name: 'Pastor Mike Russo', role: 'Senior pastor', phones: ['757-555-4471'], emails: ['mike@gracefellowship.org'] },
    { name: 'Linda Carter', role: 'Secretary', phones: [], emails: ['office@gracefellowship.org'] },
  ],
  rules: { noGiftCards: true, noMoneyByText: true, noPersonalInfo: true, noNewNumbers: true },
  extra_note: '',
};

const cases = [
  // [description, message, sender, expected verdict]
  ['classic gift card ask', 'Hi this is Pastor Mike. I need you to get 4 Apple gift cards for a sick member in the hospital. Scratch the back and send me pictures.', '(301) 555-9876', 'scam'],
  ['opening line from unknown number', 'Hello, this is Pastor Russo. Are you available? I need a quick favor.', '301-555-9876', 'scam'],
  ['opening line, no sender given', 'Pastor Mike here. Are you available? Text only, in a meeting.', '', 'scam'],
  ['gift card even from the REAL number (spoofing)', 'Can you pick up some Google Play cards for me? Will pay you back Sunday.', '757-555-4471', 'scam'],
  ['zelle ask from gmail', 'Mike Russo here, please Zelle $300 for the youth trip today, keep this between us', 'pastormike.russo@gmail.com', 'scam'],
  ['new number claim', 'Hey it\'s Pastor Mike, this is my new number, save it.', '804-555-1212', 'scam'],
  ['code phishing', 'This is the church office. Please reply with the verification code we just sent to update the church directory.', '', 'scam'],
  ['harmless reminder from real number', 'Reminder: choir practice moved to 7pm Thursday. See you there!', '757-555-4471', 'caution'],
  ['harmless note, unknown sender', 'Thanks for helping with the potluck on Sunday.', '', 'caution'],
];

let pass = 0;
for (const [desc, msg, sender, want] of cases) {
  const r = runRules(church, msg, sender);
  try {
    assert.equal(r.verdict, want, `${desc}: expected ${want}, got ${r.verdict} (flags: ${r.flags.join(', ')})`);
    pass++;
    console.log(`ok   ${desc} -> ${r.verdict} [${r.flags.join(', ')}]`);
  } catch (e) {
    console.log(`FAIL ${e.message}`);
  }
}

// Full answer without AI: wording and safety guarantees.
const a = await checkMessage(church, { message: cases[0][1], sender: cases[0][2] });
assert.equal(a.verdict, 'scam');
assert.ok(a.steps.some(s => s.includes('757-555-0100')), 'steps include office phone');
assert.ok(a.contactHints.some(h => h.includes('4471')), 'hint shows last four of real number');
assert.ok(!JSON.stringify(a).includes('757-555-4471'), 'full private staff number never shown');
const b = await checkMessage(church, { message: cases[7][1], sender: cases[7][2] });
assert.equal(b.verdict, 'caution');
assert.ok(!/\bsafe\b/i.test(b.headline + b.explanation) || /not|can't|cannot/i.test(b.headline + b.explanation), 'never calls it safe');
console.log('ok   full answers (no AI)');
console.log(`headline for scam: ${a.headline}`);
console.log(`headline for harmless: ${b.headline}`);

console.log(`\n${pass}/${cases.length} rule cases passed`);
if (pass !== cases.length) process.exit(1);
