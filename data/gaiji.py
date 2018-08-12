#!/usr/bin/env python
# -*- coding: utf-8 -*-

import json
import os
import re


def sub_gaiji(m):
    m = m.group()
    t = gaiji.get(m)
    if not t:
        print('%s: %s' % (m, t or '?'))
    return '[%s=%s' % (t, m[1:]) if t else m


gaiji = json.load(open('gaiji.json'))
gaiji = {v['zzs']: v.get('normal', v.get('unicode-char')) for k, v in gaiji.items() if 'zzs' in v}

for fn in os.listdir('.'):
    if fn.endswith('.txt'):
        with open(fn) as f:
            text = f.read()
        text = re.sub(r'\[[^\]]+[*/@+?-][^\]]+\]', sub_gaiji, text)
        with open(fn, 'w') as f:
            f.write(text)
