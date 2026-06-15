require('dotenv').config();
const express = require('express');
const Groq = require('groq-sdk');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const HUMANIZER_PROMPT = `You write like a thoughtful reader sharing genuine reactions, not a summarizer. Never start with "honestly" or "look,". Instead, lead with the specific idea that made the book worth reading. Be direct. Share what surprised you. Mention a specific concept or story from the book. Don't say "game-changer" or "must-read." Don't use filler phrases. Every sentence should carry a distinct idea.`;

app.post('/api/summarize', async (req, res) => {
  const { query } = req.body;

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return res.status(400).json({ error: 'Please provide a book name or author.' });
  }

  if (query.length > 200) {
    return res.status(400).json({ error: 'Keep it under 200 characters.' });
  }

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `${HUMANIZER_PROMPT}

You summarize non-fiction books. Return ONLY valid JSON \u2014 no text outside the JSON object.

If input is an AUTHOR NAME: set isAuthorSearch to true, list their books in otherWorks, then summarize their best-known book.
If input is a BOOK TITLE: set isAuthorSearch to false, list a few other books by that author in otherWorks.

IMPORTANT for summary: Lead with the book's core argument or most surprising insight. Mention a specific example, study, or story from the book. Explain WHY this matters, not just WHAT the book says. Each paragraph should cover a different angle. Never start two sentences the same way.

IMPORTANT for substackPosts: provide the author's Substack handle/username so links can be generated. Format exactly as: "Newsletter Title | authorhandle" \u2014 pick real well-known Substack writers who write about the same themes.

JSON schema (follow exactly):
{"bookTitle":"string","author":"string","isAuthorSearch":false,"otherWorks":["string"],"summary":"string (2-3 paragraphs separated by \\n\\n, each paragraph a different angle on the book)","keyTakeaways":["string","string","string","string","string"],"practicalSteps":["string","string","string","string","string"],"substackPosts":["Newsletter Title | authorhandle","Newsletter Title | authorhandle","Newsletter Title | authorhandle"],"whoShouldRead":"string"}`
        },
        {
          role: 'user',
          content: query.trim()
        }
      ],
      temperature: 0.7,
      max_tokens: 3000,
      response_format: { type: 'json_object' },
    });

    let content = completion.choices[0].message.content;
    content = content.replace(/^```(?:json)?\s*\n?/gm, '').replace(/\n?```\s*$/gm, '').trim();
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in response:', content);
      return res.status(500).json({ error: 'Hmm, something went wrong. Give it another shot.' });
    }
    const parsed = JSON.parse(jsonMatch[0]);

    if (parsed.error) {
      return res.status(404).json({ error: parsed.error });
    }

    res.json(parsed);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return res.status(500).json({ error: 'Response got garbled. Try again?' });
    }
    if (error.status === 401) {
      return res.status(500).json({ error: 'API key issue. Check your .env file.' });
    }
    console.error('Error:', error.message);
    res.status(500).json({ error: 'Something broke. Try again in a sec.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Book Summary App running at http://localhost:${PORT}`);
});
