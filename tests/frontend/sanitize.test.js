import { describe, it, expect, beforeEach } from 'vitest';
import DOMPurify from 'dompurify';

describe('Sanitize Function', () => {
  beforeEach(() => {
    // expose window.sanitize
    require('../../client/js/sanitize.js');
  });

  it('should escape HTML tags', () => {
    const dirty = '<script>alert("xss")</script>';
    const clean = window.sanitize(dirty);
    expect(clean).not.toContain('<script>');
  });
});
