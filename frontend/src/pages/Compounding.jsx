import CompoundingStudio from "../components/CompoundingStudio";
import Disclaimer from "../components/Disclaimer";

export default function Compounding() {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Growth Lab</h1>
          <p>
            See how regular saving and a steady rate of return build on themselves over time. Change the numbers and
            watch the curve respond.
          </p>
        </div>
      </div>
      <CompoundingStudio />
      <Disclaimer>
        The Growth Lab only does arithmetic on the numbers you enter. It is not a forecast, ignores fees, taxes and
        losses, and is not investment advice.
      </Disclaimer>
    </div>
  );
}
