import { failingAction } from './actions';

export default function ActionError() {
  return (
    <main>
      <h1>Server action</h1>
      <form action={failingAction}>
        <button type="submit">Run failing action</button>
      </form>
    </main>
  );
}
