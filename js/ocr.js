/**
 * ocr.js
 * OCR 기반 구독 자동 등록 루트.
 * 현재: 이미지에서 텍스트 패턴 파싱 (클라이언트 사이드 근사)
 * 향후: POST /api/ocr 엔드포인트 또는 Google Vision / Clova OCR API 교체
 */
(function (global) {
  'use strict';

  /* ─────────────────────────────────────
   * SubscriptionOCRProvider
   * 향후 교체 지점: extractFromImage() 내부만 교체하면 됨
   * ───────────────────────────────────── */
  const SubscriptionOCRProvider = {
    /**
     * 이미지 파일(File 객체)에서 구독 정보를 추출
     * @param {File} imageFile
     * @returns {Promise<OCRResult>}
     */
    async extractFromImage(imageFile) {
      // 향후 교체:
      // const formData = new FormData();
      // formData.append('image', imageFile);
      // return await fetch('/api/ocr/subscription', { method:'POST', body: formData }).then(r=>r.json());

      // 현재: 클라이언트에서 canvas로 이미지 읽은 뒤 패턴 매칭
      return parseImageLocally(imageFile);
    },

    /**
     * 텍스트 문자열에서 직접 구독 정보 파싱 (복사·붙여넣기 루트)
     * @param {string} text
     * @returns {OCRResult}
     */
    extractFromText(text) {
      return parseTextPatterns(text);
    },
  };

  /* ─────────────────────────────────────
   * 로컬 이미지 파싱 (canvas + 패턴 매칭)
   * ───────────────────────────────────── */
  async function parseImageLocally(imageFile) {
    // 이미지를 canvas에 그려 픽셀 데이터 추출 — 실제 OCR 없이 파일 메타만 활용
    // 실 서비스에서는 여기에 Tesseract.js 또는 외부 API 호출
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        // 현재 구현: 파일명에서 서비스명 추론 시도
        const filename = imageFile.name.toLowerCase();
        const result = parseTextPatterns(filename);
        result.source = 'image_filename';
        result.confidence = 0.3; // 파일명 기반이라 낮은 신뢰도
        resolve(result);
      };
      reader.readAsDataURL(imageFile);
    });
  }

  /* ─────────────────────────────────────
   * 텍스트 패턴 매칭
   * 구독 영수증·결제 문자·앱 화면 텍스트에서 정보 추출
   * ───────────────────────────────────── */
  const SERVICE_PATTERNS = [
    { pattern: /chatgpt|openai/i,    serviceId: 'chatgpt',    serviceName: 'ChatGPT',   category: 'ai' },
    { pattern: /claude|anthropic/i,  serviceId: 'claude',     serviceName: 'Claude',    category: 'ai' },
    { pattern: /perplexity/i,        serviceId: 'perplexity', serviceName: 'Perplexity',category: 'ai' },
    { pattern: /cursor/i,            serviceId: 'cursor',     serviceName: 'Cursor',    category: 'dev' },
    { pattern: /figma/i,             serviceId: 'figma',      serviceName: 'Figma',     category: 'design' },
    { pattern: /notion/i,            serviceId: 'notion',     serviceName: 'Notion',    category: 'productivity' },
    { pattern: /canva/i,             serviceId: 'canva',      serviceName: 'Canva',     category: 'design' },
    { pattern: /netflix/i,           serviceId: 'netflix',    serviceName: 'Netflix',   category: 'media' },
    { pattern: /adobe/i,             serviceId: 'adobe',      serviceName: 'Adobe CC',  category: 'design' },
  ];

  // 금액 패턴: ₩12,000 / 12000원 / $9.99 / KRW 15,000
  const PRICE_PATTERNS = [
    /₩\s*([\d,]+)/,
    /([\d,]+)\s*원/,
    /KRW\s*([\d,]+)/i,
    /\$\s*([\d.]+)/,
    /USD\s*([\d.]+)/i,
  ];

  // 날짜 패턴: 2026-08-18 / 2026.08.18 / 08/18/2026
  const DATE_PATTERNS = [
    /(\d{4})[-./](\d{1,2})[-./](\d{1,2})/,
    /(\d{1,2})[-./](\d{1,2})[-./](\d{4})/,
    /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/,
  ];

  // 결제 주기 패턴
  const CYCLE_PATTERNS = [
    { pattern: /연간|yearly|annual|year/i, value: 'yearly' },
    { pattern: /월간|monthly|month|매월/i,  value: 'monthly' },
  ];

  function parseTextPatterns(text) {
    const result = {
      serviceName: null,
      serviceId: null,
      category: null,
      planName: null,
      price: null,
      currency: 'KRW',
      billingCycle: null,
      nextBillingDate: null,
      source: 'text',
      confidence: 0,
      rawText: text,
      needsReview: true, // OCR 결과는 항상 사용자 검토 필요
    };

    // 서비스명 추출
    for (const sp of SERVICE_PATTERNS) {
      if (sp.pattern.test(text)) {
        result.serviceId  = sp.serviceId;
        result.serviceName = sp.serviceName;
        result.category   = sp.category;
        result.confidence += 0.4;
        break;
      }
    }

    // 금액 추출
    for (const pp of PRICE_PATTERNS) {
      const m = text.match(pp);
      if (m) {
        const raw = m[1].replace(/,/g, '');
        result.price = parseFloat(raw);
        result.currency = pp.source.includes('\\$') || pp.source.includes('USD') ? 'USD' : 'KRW';
        result.confidence += 0.3;
        break;
      }
    }

    // 날짜 추출
    for (const dp of DATE_PATTERNS) {
      const m = text.match(dp);
      if (m) {
        try {
          const parts = m.slice(1).map(Number);
          // YYYY-MM-DD 순서 판별
          const dateStr = parts[0] > 1000
            ? `${parts[0]}-${String(parts[1]).padStart(2,'0')}-${String(parts[2]).padStart(2,'0')}`
            : `${parts[2]}-${String(parts[0]).padStart(2,'0')}-${String(parts[1]).padStart(2,'0')}`;
          result.nextBillingDate = dateStr;
          result.confidence += 0.2;
        } catch (e) { /* 파싱 실패 무시 */ }
        break;
      }
    }

    // 결제 주기 추출
    for (const cp of CYCLE_PATTERNS) {
      if (cp.pattern.test(text)) {
        result.billingCycle = cp.value;
        result.confidence += 0.1;
        break;
      }
    }

    result.confidence = Math.min(1, result.confidence);
    return result;
  }

  /* ─────────────────────────────────────
   * OCR 결과 → 구독 데이터 변환
   * ───────────────────────────────────── */
  function ocrResultToSubscription(ocrResult) {
    const now = new Date().toISOString().slice(0, 10);
    return {
      id: 'sub_' + Date.now(),
      serviceId:    ocrResult.serviceId || ('custom_' + Date.now()),
      planId:       (ocrResult.serviceId || 'custom') + '_plan',
      serviceName:  ocrResult.serviceName || '',
      planName:     ocrResult.planName    || '',
      price:        ocrResult.price       || 0,
      currency:     ocrResult.currency    || 'KRW',
      taxIncluded:  true,
      billingCycle: ocrResult.billingCycle || 'monthly',
      nextBillingDate: ocrResult.nextBillingDate || now,
      committedUntil: null,
      seats: 1,
      category:     ocrResult.category || 'other',
      capabilityTags: [],
      purpose: 'personal',
      importance: null,
      replacementDifficulty: null,
      collectible: true,
      keepUntil: null,
      createdAt: now,
      updatedAt: now,
      // OCR 메타
      _ocrSource:     ocrResult.source,
      _ocrConfidence: ocrResult.confidence,
      _needsReview:   true, // 항상 사용자 검토 요청
    };
  }

  /* ─────────────────────────────────────
   * Public API
   * ───────────────────────────────────── */
  global.SubscriptionOCRProvider = SubscriptionOCRProvider;
  global.AppOCR = {
    extractFromText: SubscriptionOCRProvider.extractFromText,
    ocrResultToSubscription,
    parseTextPatterns,
  };

})(window);
