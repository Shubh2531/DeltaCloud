export default function Disclaimer({ children }) {
  return (
    <p className="disclaimer">
      {children ||
        "DeltaCloud is for learning. Everything here uses practice money. Nothing on this page is investment advice or a prediction of future prices."}
    </p>
  );
}
