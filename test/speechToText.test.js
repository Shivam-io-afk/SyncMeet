import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getSpeechRecognitionErrorMessage,
  getSpeechRecognitionRetryDelay,
} from '../src/hooks/useSpeechToText.js';

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
