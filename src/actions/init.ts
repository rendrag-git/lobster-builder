// Import all action files to trigger their registerAction() side effects
// Import this file (or a superset of it) anywhere you need the full action catalog
export * from './registry';

import './ai/call-agent';
import './ai/prompt-llm';
import './ai/web-search';
import './ai/web-fetch';
import './ai/analyze-image';

import './flow/conditional-branch';
import './flow/require-approval';
import './flow/delay-wait';
import './flow/loop-for-each';
import './flow/error-handler';

import './data/set-variable';
import './data/filter-where';
import './data/transform-pick';
import './data/merge-join';
import './data/json-renderer';

import './io/run-shell-command';
import './io/http-request';
import './io/read-file';
import './io/write-file';
import './io/send-notification';

import './openclaw/send-channel-message';
import './openclaw/tool-call';
import './openclaw/llm-json-task';
import './openclaw/run-agent';
import './openclaw/node-action';

import './meta/run-sub-workflow';
