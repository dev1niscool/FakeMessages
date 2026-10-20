import { handleNativeRequest } from './native-renderer.mjs';

// This portable fixed-route module mirrors the independently hosted Worker.
// It contains no shared upstream session or service credential.
export default {
  fetch(request) {
    return handleNativeRequest(request);
  },
};
