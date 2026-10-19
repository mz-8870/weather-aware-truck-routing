import { createContext, useContext } from "react";
import { formatter, type Formatter } from "./units";

export const UnitsContext = createContext<Formatter>(formatter("imperial"));

export const useUnits = () => useContext(UnitsContext);
