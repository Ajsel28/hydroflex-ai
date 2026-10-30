import { Link } from 'react-router';
import { Page } from '../components/layout/PageHeader';
import { EmptyState } from '../components/ui/primitives';

export default function NotFound() {
  return (
    <Page>
      <EmptyState title="Page not found" action={<Link className="text-hydro underline" to="/">Back to overview</Link>}>
        There is no view at this address.
      </EmptyState>
    </Page>
  );
}
