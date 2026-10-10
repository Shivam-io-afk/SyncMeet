import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getSpeechRecognitionErrorMessage } from '../src/hooks/useSpeechToText.js';

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
