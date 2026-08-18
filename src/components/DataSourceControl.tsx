import type { DataSource } from '../providers/types';

interface DataSourceControlProps {
  source: DataSource;
  onChange: (source: DataSource) => void;
}

export function DataSourceControl({ source, onChange }: DataSourceControlProps) {
  return (
    <div className="data-source-control" aria-label="数据源切换">
      <span>数据源</span>
      <button
        type="button"
        aria-label="切换到 Fixture 数据源"
        aria-pressed={source === 'fixture'}
        className={source === 'fixture' ? 'data-source-button data-source-button--active' : 'data-source-button'}
        onClick={() => onChange('fixture')}
      >
        Fixture
      </button>
      <button
        type="button"
        aria-label="切换到 Gateway 数据源"
        aria-pressed={source === 'gateway'}
        className={source === 'gateway' ? 'data-source-button data-source-button--active' : 'data-source-button'}
        onClick={() => onChange('gateway')}
      >
        Gateway
      </button>
    </div>
  );
}
