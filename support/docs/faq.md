---
title: Faq
related:
  doc: ['features']
---

## How is the name written?

**Generate**

Generate, with a capital "G", the rest lowercase.

**generator.js**

The file, `generator.js` is all lowercase, no capital letters.


<a name="aliases">
## Aliases

**What's a generator's alias, and what do they do?**

Generate tries to find globally installed generators using an "alias" first, falling back on the generator's full name if not found by its alias.

A generator's alias is created by stripping the substring `generator-` from the _full name_ of generator. Thus, when publishing a generator the naming convention `generator-foo` should be used (where `foo` is the alias, and `generator-foo` is the full name).

Note that **no dots may be used in published generator names**. Aside from that, any characters considered valid by npm are fine.