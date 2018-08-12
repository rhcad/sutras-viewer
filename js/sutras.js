/**
 * Created by zhangyg on 2018/8/9.
 */
(function(global) {

  var signs = {
    volume: '[A-Z]+\\d+',     // 册别=藏经代码+册号
    docNum: 'n\\d+',          // 经号
    edition: '[A-Za-z_]',     // 别本
    pageNum: 'p\\d+',         // 页号
    colLine: '[a-z]\\d+',     // 栏号、行号
    postfix: '([A-Za-z_][A-Za-z0-9#=-]{2})?' // 类别标签
  };
  var re = {
    headFull: new RegExp('^' + signs.volume + signs.docNum + signs.edition
      + signs.pageNum + signs.colLine + signs.postfix + '[║]?'),
    head: new RegExp('^' + signs.volume + signs.docNum + signs.edition
      + signs.pageNum + signs.colLine),
    volume: new RegExp('^' + signs.volume),
    docNum: new RegExp('^' + signs.docNum + signs.edition),
    pageNum: new RegExp('^' + signs.pageNum),
    colLine: new RegExp('^' + signs.colLine),
    postfix: new RegExp('^' + signs.postfix),
    separators: /[。！？「」『』（）《》]/,
    mergePunctuation: /[。！？]/,
    noMergeToPrev: /^[「『#]/,
    noMergeWithNext: /[。！？」』：#]$/,
    newline: /<p>|<P>|[ＰPk]/g,
    notePara: /^\s*[（(].+?[）)][。！？]?\s*$/,
    combineChar: /\[[^\]]+[*/@+?-][^\]]+]/g,
    numRef: /\[(\d+|\*)]|<\d+>/g,
    headMultiSpace: /^\s{2}/
  };
  var tagMap = {
    'N': 'doc-num',     // 经号
    'X': 'preface',     // 序
    'x': 'preface',     // 不在卷前的序
    'A': 'author',      // 著者，造、釋、著、撰、述、說、作、略、纂、編述
    'Y': 'translator',  // 译者
    'E': 'editor',      // 编辑者
    'C': 'collector',   // 收集者
    'B': 'byline',      // 錄：抄寫、謄寫、記、書、梓
    'D': 'varga',       // 品，相当于段位、主题集合
    'Q': 'other-head',  // 其它标题
    'q': 'other-head',  // 小经标题
    'J': 'eulo',        // 经卷（开始）
    'j': 'eulo-end',    // 经卷（结束）
    'S': 'gatha',       // 偈颂（开始）
    's': 'gatha-end',   // 偈颂（结束）
    'T': 'gatha',       // 不规则偈颂（开始）
    't': 'gatha-end',   // 不规则偈颂（结束）
    'Z': 'mantra',      // 咒语
    'W': 'appendix',    // 附文，具缩排统一的性质
    'WP': 'appendix',   // 附文
    'L': 'item',        // 列表项
    'I': 'item',        // 列表项
    'M': 'item',        // 经录中的列表项
    'R': 'comment'      // 项目说明
  };
  var lastParagraph;    // 上一个段落 <p>
  var lastContent;      // 上一个段落的内容
  var stack;            // 组合元素的堆栈
  var merged;           // 是否合并行内容
  var para;             // 当前段落元素 <p>

  function pick(text, pattern) {
    return pattern.test(text) ? pattern.exec(text)[0].trim() : '';
  }

  function pickRest(text, left, retain) {
    text = text.substring(left.length);
    return retain ? text : text.trim();
  }

  function addSpan(p, cls, text) {
    if (text.length) {
      var span = $('<span class="' + cls + '">' + text + '</span>');
      p.append(span);
      return span;
    }
  }

  function canMergePara_(tag, cls) {
    return lastParagraph && lastParagraph.hasClass(cls) && (!tag.length || tag === cls);
  }

  function canMergePara(tag, content, headFull) {
    var a = lastParagraph && content.length;
    var b = a && (headFull.indexOf('=') > 0 || !tag.length ||
      canMergePara_(tag, 'mantra') || canMergePara_(tag, 'appendix') || canMergePara_(tag, 'doc-num'));
    var c = b && !re.noMergeWithNext.test(lastParagraph.text());
    var d = c && !re.noMergeToPrev.test(content);
    return d;
  }

  function getLastIndent(tag, content) {
    if (lastParagraph && (!tag.length || re.newline.test(content))) {
      return lastParagraph.hasClass('indent1') ? 1 :
        lastParagraph.hasClass('indent2') ? 2 :
          lastParagraph.hasClass('indent3') ? 3 :
            lastParagraph.hasClass('indent4') ? 4 : 0;
    }
  }

  function parsePhrase(content, phrase) {
    var index = content.indexOf(phrase);

    content = content.substring(index + phrase.length);
    var rests = re.separators.exec(content);
    var rest = rests && rests.index === 0 && rests[0];

    // 将句末标点合并到句子中
    if (rest && re.mergePunctuation.test(rest)) {
      phrase += rest;
      content = content.substring(rest.length);
      rest = null;
    }
    var span = addSpan(para, 'text', phrase);
    if (span && merged) {
      span.addClass('merged');
      merged = false;
    }

    if (rest) {
      if ('「『（'.indexOf(rest) >= 0) {
        stack.push(para);
        span = $('<span class="' + (rest === '（' ? 'note-inline' : 'quote') + '"></span>');
        para.append(span);
        para = span;
      }
      else if ('」』）'.indexOf(rest) >= 0 && stack.length) {
        para = stack.pop();
      }
      addSpan(para, 'pu', rest);
      content = content.substring(rest.length);
    }

    return content;
  }

  function replaceCombinedChar(m) {
    m = m.replace(/（/g, '(').replace(/）/g, ')');
    if (/\[[\u4e00-\u9fa5]=/.test(m)) {
      return '<a class="cb-char" cb="' + m + '">' + m[1] + '</a>';
    }
    return '<a class="cb-char" cb="">' + m + '</a>';
  }

  function replaceNumRef(m) {
    return '<sup><a class="num-ref">' + m + '</a></sup>';
  }

  function parseCombinedChar(content) {
    return content.replace(re.combineChar, replaceCombinedChar)
      .replace(re.numRef, replaceNumRef);
  }

  function parseLine(line, container) {
    // 得到行首标记 head、行内正文 content、行类型标记 tag、缩进数或级别 indent
    var headFull = pick(line, re.headFull);
    var head = pick(headFull, re.head);
    var rest = pickRest(headFull, head);
    var tag = rest.replace(/#|_|-|\d|║/g, '');
    var indent = /\d$/.test(rest) ? parseInt(rest.substring(rest.length - 1)) : 0;
    var span, phrases, phrase;

    tag = tagMap[tag] || tag;
    var content = line.substring(headFull.length), oldContent = content;
    if (tag !== 'doc-num') {
      content = content.replace(/\(/g, '（').replace(/\)/g, '）');  // 将圆括号改为全角的，适应夹注说明
      content = content.replace(/\s+/g, '　');
    }
    indent = getLastIndent(tag, content) || indent;
    merged = canMergePara(tag, content, headFull) && rest.indexOf('P') < 0
      && !re.headMultiSpace.test(oldContent) && !re.headMultiSpace.test(lastContent);

    if (merged) {
      lastContent += oldContent;
      para = lastParagraph;
      span = para.find('.text:last-child');
      span.addClass('merged');
    } else {
      para = $('<p></p>');
      container.append(para);
      para.addClass(tag.length ? tag : 'P');
      if (indent) {
        para.addClass('indent' + indent);
      }
      lastParagraph = para;
      lastContent = oldContent;
      stack = [];
    }
    if (re.notePara.test(lastContent)) {
      para.addClass('note-para');
    }

    addSpan(para, 'line-head', head);
    content = parseCombinedChar(content.replace(re.newline, '<br>'));
    if (!content.length) {
      return;
    }

    if (tag === 'doc-num' || tag === 'eulo-end') {
      addSpan(para, 'text', content);
    } else {
      phrases = content.split(re.separators).filter(function(t) {
        return t.length;
      });
      phrases.unshift('');

      while (phrases.length) {
        phrase = phrases.shift();
        content = parsePhrase(content, phrase, para);
      }
      addSpan(para, 'pu', content);
      if (indent) {
        para.find('br').addClass('indent' + indent);
      }
    }
  }

  /**
   * 解析CBETA格式的经文文本，生成阅读页面
   * @param text CBETA格式的经文文本
   * @param container 阅读文本页面的容器DIV对象的ID
   */
  global.parseSutras = function(text, containerId) {
    var container = $('#' + containerId);
    container.text('');
    lastParagraph = lastContent = null;
    stack = [];
    text.split('\n').forEach(function(line) {
      parseLine(line.trim(), container);
    });
  };

  global.switchSutrasOption = function(cls, containerId) {
    $('#' + containerId).toggleClass('show-' + cls);
  };
})(window);
