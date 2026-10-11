import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getSpeechRecognitionErrorMessage,
  getSpeechRecognitionRetryDelay,
  keepRecentTranscripts,
} from '../src/hooks/useSpeechToText.js';

test('in-memory transcript history retains only the latest 1,000 entries', () => {
  const transcripts = Array.from({ length: 1_005 }, (_, index) => ({ id: index }));

  const recent = keepRecentTranscripts(transcripts);

  assert.equal(recent.length, 1_000);
  assert.equal(recent[0].id, 5);
  assert.equal(recent.at(-1).id, 1_004);
  assert.equal(transcripts.length, 1_005, 'the source array should not be mutated');
});

test('speech recognition permission and device failures provide actionable guidance', () => {
  for (const error of ['not-allowed', 'service-not-allowed']) {
    assert.match(getSpeechRecognitionErrorMessage(error), /Allow microphone access/);
  }
  assert.match(getSpeechRecognitionErrorMessage('audio-capture'), /No microphone is available/);
  assert.match(getSpeechRecognitionErrorMessage('language-not-supported'), /language is not supported/);
});

test('transient network and unknown recognition failures are described clearly', () => {
  assert.match(getSpeechRecognitionErrorMessage('network'), /retry automatically/);
  assert.match(getSpeechRecognitionErrorMessage('unknown'), /Turn transcription off and on/);
});

test('speech recognition retry delay increases exponentially and has a 15-second cap', () => {
  assert.equal(getSpeechRecognitionRetryDelay(0), 600);
  assert.equal(getSpeechRecognitionRetryDelay(1), 1_200);
  assert.equal(getSpeechRecognitionRetryDelay(2), 2_400);
  assert.equal(getSpeechRecognitionRetryDelay(4), 9_600);
  assert.equal(getSpeechRecognitionRetryDelay(5), 15_000);
  assert.equal(getSpeechRecognitionRetryDelay(20), 15_000);
  assert.equal(getSpeechRecognitionRetryDelay(-1), 600);
});
