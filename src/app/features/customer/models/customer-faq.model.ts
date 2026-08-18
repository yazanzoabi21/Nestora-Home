export interface CustomerFaqRow {
  readonly id: string;
  readonly question_en: string;
  readonly question_ar: string;
  readonly answer_en: string;
  readonly answer_ar: string;
  readonly category: string | null;
  readonly sort_order: number;
  readonly is_active: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CustomerFaq {
  readonly id: string;
  readonly questionEn: string;
  readonly questionAr: string;
  readonly answerEn: string;
  readonly answerAr: string;
  readonly category: string | null;
}

export interface LocalizedCustomerFaq {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
  readonly category: string | null;
}
