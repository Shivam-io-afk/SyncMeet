/**
 * Gemini AI Meeting Summarization & Live Q&A Assistant Service
 * Gemini credentials are used by the backend and are never bundled into the browser.
 */

import { apiService } from './apiService';

export async function generateAIMeetingNotes(transcriptList) {
  if (!transcriptList || transcriptList.length === 0) {
    throw new Error('No transcript dialog available to summarize yet. Speak in the meeting or add items first.');
  }

  return generateLocalIntelligentSummary(transcriptList);
}

/**
 * Ask Gemini questions about the ongoing meeting transcript and notes
 */
export async function queryAIAssistant(roomId, transcriptList = [], notesData = null, question = '') {
  try {
    const response = await apiService.askAssistant(roomId, transcriptList, notesData, question);
    if (response?.success && response.data) return response.data;
    throw new Error('AI assistant did not return an answer');
  } catch (err) {
    console.warn('Backend AI assistant unavailable, using local response:', err.message);
    return generateLocalAssistantResponse(transcriptList, notesData, question);
  }
}

/**
 * Resilient deterministic rule-based local assistant response
 */
function generateLocalAssistantResponse(transcripts = [], notesData = null, query = '') {
  const lower = query.toLowerCase();

  if (transcripts.length === 0 && !notesData) {
    return 'There is not enough meeting context to answer yet. Start transcription or generate notes first.';
  }

  if (lower.includes('action') || lower.includes('task') || lower.includes('todo')) {
    if (notesData?.actionItems?.length > 0) {
      return `Here are the identified action items:\n` + notesData.actionItems.map(a => `• **${a.task}** (Assigned to: ${a.assignee} | Priority: ${a.priority})`).join('\n');
    }
    const actionLines = transcripts.filter(({ text = '' }) =>
      /\b(need to|will|should|action|task|todo|follow.?up|assigned)\b/i.test(text)
    );
    return actionLines.length
      ? `Possible action items from the transcript:\n${actionLines.map(({ speaker, text }) => `• ${speaker || 'Participant'}: ${text}`).join('\n')}`
      : 'I could not identify an action item in the available meeting context.';
  }

  if (lower.includes('decision') || lower.includes('agree')) {
    if (notesData?.decisions?.length > 0) {
      return `The team agreed on the following decisions:\n` + notesData.decisions.map(d => `• ${d}`).join('\n');
    }
    const decisionLines = transcripts.filter(({ text = '' }) =>
      /\b(agreed|decided|approved|finalized)\b/i.test(text)
    );
    return decisionLines.length
      ? `Possible decisions from the transcript:\n${decisionLines.map(({ text }) => `• ${text}`).join('\n')}`
      : 'I could not identify an explicit decision in the available meeting context.';
  }

  if (lower.includes('email') || lower.includes('draft')) {
    if (!notesData?.summary && transcripts.length === 0) {
      return 'There is not enough meeting context to draft a useful follow-up yet.';
    }
    const summary = notesData?.summary || transcripts.map(({ text }) => text).join(' ');
    const actions = notesData?.actionItems?.map((item) => `- ${item.task}`).join('\n') || '- No action items were identified.';
    return `Subject: Meeting follow-up\n\nHi team,\n\nHere is a brief recap of our meeting:\n\n${summary}\n\nNext steps:\n${actions}\n\nBest,`;
  }

  const terms = lower.match(/[a-z0-9]{4,}/g) || [];
  const relevantLines = transcripts.filter(({ text = '' }) =>
    terms.some((term) => text.toLowerCase().includes(term))
  );
  if (relevantLines.length > 0) {
    return `Relevant transcript entries:\n${relevantLines.map(({ timestamp, speaker, text }) => `• [${timestamp || 'Time unavailable'}] ${speaker || 'Participant'}: ${text}`).join('\n')}`;
  }

  return notesData?.summary || 'I could not find an answer to that question in the available transcript or notes.';
}

/**
 * Resilient deterministic rule-based local parser for instant zero-config experience
 */
function generateLocalIntelligentSummary(transcriptList) {
  const actionItems = [];
  const decisions = [];
  const openQuestions = [];

  transcriptList.forEach((entry) => {
    const lower = entry.text.toLowerCase();
    
    // Action Item heuristic
    if (lower.includes('will') || lower.includes('need to') || lower.includes('should') || lower.includes('task') || lower.includes('todo') || lower.includes('let\'s') || lower.includes('draft') || lower.includes('build')) {
      actionItems.push({
        task: entry.text.replace(/^(let's|i will|we should|we need to)\s+/i, '').trim(),
        assignee: entry.speaker || 'Team',
        priority: lower.includes('urgent') || lower.includes('asap') || lower.includes('friday') ? 'High' : 'Medium',
      });
    }

    // Decision heuristic
    if (lower.includes('agree') || lower.includes('decided') || lower.includes('approved') || lower.includes('let\'s go with') || lower.includes('finalized')) {
      decisions.push(entry.text);
    }

    // Open Question heuristic
    if (entry.text.includes('?') || lower.startsWith('how') || lower.startsWith('what if') || lower.startsWith('why')) {
      openQuestions.push(entry.text);
    }
  });

  return {
    summary: transcriptList.map(({ speaker, text }) => `${speaker || 'Participant'}: ${text}`).join('\n'),
    decisions: decisions.slice(0, 4),
    actionItems: actionItems.slice(0, 6),
    openQuestions: openQuestions.slice(0, 3),
  };
}
