export type CustomerContentSectionType = 'text' | 'notice' | 'list';

interface CustomerContentSectionBase {
  readonly type: CustomerContentSectionType;
  readonly title: string;
}

export interface CustomerTextSection extends CustomerContentSectionBase {
  readonly type: 'text';
  readonly body: string;
}

export interface CustomerNoticeSection extends CustomerContentSectionBase {
  readonly type: 'notice';
  readonly body: string;
}

export interface CustomerListSection extends CustomerContentSectionBase {
  readonly type: 'list';
  readonly items: readonly string[];
}

export type CustomerContentSection =
  | CustomerTextSection
  | CustomerNoticeSection
  | CustomerListSection;
