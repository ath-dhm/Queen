import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
// import KeyboardEventHandler from 'react-keyboard-event-handler';
import * as lunatic from '@inseefr/lunatic';
// import alphabet from 'utils/constants/alphabet';
import * as UQ from 'utils/questionnaire';
import { DIRECT_CONTINUE_COMPONENTS /* , KEYBOARD_SHORTCUT_COMPONENTS */ } from 'utils/constants';
import { sendStartedEvent, sendCompletedEvent } from 'utils/communication';
import Header from './header';
import Buttons from './buttons';
import ContinueButton from './buttons/continue';
import NavBar from './rightNavbar';

const Orchestrator = ({
  surveyUnit,
  standalone,
  readonly,
  savingType,
  preferences,
  features,
  source,
  dataSU,
  filterDescription,
  save,
  close,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [started, setStarted] = useState(() => {
    if (dataSU.data.COLLECTED) {
      return Object.keys(dataSU.data.COLLECTED).length > 0;
    }
    return false;
  });

  const { questionnaire, components, handleChange, bindings } = lunatic.useLunatic(
    source,
    dataSU.data,
    {
      savingType,
      preferences,
      features,
    }
  );

  const [currentPage, setCurrentPage] = useState(1);

  const [specialQueenData, setSpecialQueenData] = useState(dataSU.specialQueenData);
  const [comment /* , setComment */] = useState(surveyUnit.comment);
  const [validatePages, setValidatePages] = useState(() => {
    const page = UQ.getFirstTitlePageBeforeFastForwardPage(questionnaire)(bindings)(
      specialQueenData
    );
    return page >= 1 ? Array.from(Array(page - 1), (_, i) => i + 1) : [];
  });
  const [previousResponse, setPreviousResponse] = useState(null);

  const addValidatePage = useCallback(() => {
    let newValidatePages = validatePages;
    if (!validatePages.includes(currentPage)) {
      newValidatePages = [...newValidatePages, currentPage];
      setValidatePages(newValidatePages);
    }
    return newValidatePages;
  }, [currentPage, validatePages, setValidatePages]);

  /**
   * This function updates the values of the questionnaire responses
   * from the data entered by the user.
   * This function is disabled when app is in readonly mode.
   * @param {*} component the current component
   */
  const onChange = component => updatedValue => {
    if (!readonly) {
      if (!previousResponse) {
        setPreviousResponse(UQ.getCollectedResponse(questionnaire)(component));
      }
      handleChange(updatedValue);
    }
  };

  const filteredComponents = components.filter(c => c.page);

  const component = filteredComponents.find(({ page }) => page === currentPage);
  const { id, componentType, sequence, subsequence, options, ...props } = component;
  // TODO : get specialAnswer from component (specified in Pogues)
  // to wait, set to false by default
  const specialAnswer = { refusal: false, doesntKnow: false };

  const pageFilter = UQ.findPageIndex(filteredComponents)(currentPage);
  const isLastComponent = filteredComponents.length - 1 === pageFilter;
  /**
   *  This function update response values in questionnaire and specialQueenData.
   *  At the end, it calls the saving method of its parent (saving into indexdb)
   * @param {*} lastSpecialQueenData (specialQueenData update by "Refusal" and "doesn't know" buttons )
   */
  const saveQueen = useCallback(
    async (lastSpecialQueenData = specialQueenData) => {
      setSpecialQueenData(lastSpecialQueenData); // update specialQueenData according to selected buttons
      const dataToSave = UQ.getStateToSave(questionnaire)(lastSpecialQueenData);
      await save({ ...surveyUnit, data: dataToSave, comment });
    },
    [comment, save, surveyUnit, questionnaire, specialQueenData, setSpecialQueenData]
  );

  /**
   * @return boolean if user can continue to the next page.
   * TODO : manage "refusal" and "doesn't know" response
   */
  const goNextCondition = () => {
    return true;
  };

  const goPrevious = () => {
    setPreviousResponse(null);
    setCurrentPage(UQ.getPreviousPage(filteredComponents)(currentPage));
  };

  const goNext = useCallback(
    async (lastSpecialQueenData = specialQueenData) => {
      saveQueen(lastSpecialQueenData);
      setPreviousResponse(null);
      const nextPage = UQ.getNextPage(filteredComponents)(currentPage);
      addValidatePage();
      setCurrentPage(nextPage);
    },
    [filteredComponents, saveQueen, addValidatePage, specialQueenData, currentPage]
  );

  const goFastForward = useCallback(
    (lastSpecialQueenData = specialQueenData) => {
      saveQueen(lastSpecialQueenData);
      setPreviousResponse(null);
      const newValidatePages = addValidatePage();
      const filteredPage = filteredComponents.map(({ page }) => page);
      const reachesValidatePage = filteredPage.filter(p => newValidatePages.includes(p));
      const reachesNotValidatePage = filteredPage.filter(p => !newValidatePages.includes(p));
      const pageOfLastComponentToValidate =
        reachesNotValidatePage[0] ||
        UQ.getNextPage(filteredComponents)(Math.max(...reachesValidatePage));

      setCurrentPage(pageOfLastComponentToValidate);
    },
    [saveQueen, addValidatePage, filteredComponents, specialQueenData]
  );

  useEffect(() => {
    const start = async () => {
      setStarted(true);
      await sendStartedEvent(surveyUnit.id);
    };
    if (!started && !standalone && validatePages.length > 0) start();
  }, [validatePages, started, standalone, surveyUnit.id]);

  const quit = async () => {
    await saveQueen();
    if (isLastComponent && !standalone) await sendCompletedEvent(surveyUnit.id);
    close();
  };

  useEffect(() => {
    if (
      !isLastComponent &&
      previousResponse &&
      DIRECT_CONTINUE_COMPONENTS.includes(componentType)
    ) {
      goNext();
    }
  }, [questionnaire, componentType, isLastComponent, previousResponse, goNext]);

  const Component = lunatic[componentType];
  const newOptions = UQ.buildQueenOptions(componentType, options, bindings);
  // const keyToHandle = ['alphanumeric'];
  return (
    <>
      <div id="queen-body">
        <Header
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          standalone={standalone}
          title={questionnaire.label}
          quit={quit}
          sequence={lunatic.interpret(['VTL'])(bindings)(sequence)}
          subsequence={lunatic.interpret(['VTL'])(bindings)(subsequence)}
          questionnaire={questionnaire}
          bindings={bindings}
          setPage={setCurrentPage}
          validatePages={validatePages}
        />
        <div className="body-container">
          <div className="components">
            <div
              className={`lunatic lunatic-component ${
                newOptions.length >= 8 ? 'split-fieldset' : ''
              }`}
              key={`component-${id}`}
            >
              <Component
                id={id}
                {...props}
                options={newOptions}
                handleChange={onChange(component)}
                labelPosition="TOP"
                preferences={preferences}
                features={features}
                bindings={bindings}
                filterDescription={filterDescription}
                writable
                readOnly={readonly}
                disabled={readonly}
                focused
                keyboardSelection={componentType === 'CheckboxGroup'}
              />
            </div>
            {(!DIRECT_CONTINUE_COMPONENTS.includes(componentType) || readonly) &&
              (!validatePages.includes(currentPage) || isLastComponent) && (
                <ContinueButton
                  readonly={readonly}
                  canContinue={goNextCondition()}
                  isLastComponent={isLastComponent}
                  pageNext={goNext}
                  finalQuit={quit}
                />
              )}
          </div>
          <NavBar
            nbModules={questionnaire.components.filter(c => c.page).length}
            page={currentPage}
          >
            <Buttons
              readonly={readonly}
              rereading={validatePages.includes(currentPage)}
              currentComponent={component}
              specialAnswer={specialAnswer}
              page={pageFilter}
              canContinue={goNextCondition()}
              specialQueenData={specialQueenData}
              isLastComponent={isLastComponent}
              pagePrevious={goPrevious}
              pageNext={goNext}
              pageFastForward={goFastForward}
              finalQuit={quit}
            />
          </NavBar>

          {/* {KEYBOARD_SHORTCUT_COMPONENTS.includes(componentType) && (
            <KeyboardEventHandler
              handleKeys={keyToHandle}
              onKeyEvent={(key, e) => {
                const responses = UQ.getResponsesNameFromComponent(component);
                const responsesCollected = UQ.getCollectedResponse(questionnaire)(component);
                const updatedValue = {};
                if (componentType === 'CheckboxOne') {
                  updatedValue[responses[0]] = key;
                  onChange(component)(updatedValue);
                } else if (componentType === 'CheckboxGroup') {
                  const index = alphabet.findIndex(l => l.toLowerCase() === key.toLowerCase());
                  updatedValue[responses[index]] = !responsesCollected[responses[index]];
                  onChange(component)(updatedValue);
                }
              }}
              handleFocusableElements
            />
          )} */}
        </div>
      </div>
    </>
  );
};

Orchestrator.propTypes = {
  surveyUnit: PropTypes.objectOf(PropTypes.any).isRequired,
  standalone: PropTypes.bool.isRequired,
  readonly: PropTypes.bool.isRequired,
  savingType: PropTypes.oneOf(['COLLECTED', 'FORCED', 'EDITED']).isRequired,
  preferences: PropTypes.arrayOf(PropTypes.string).isRequired,
  features: PropTypes.arrayOf(PropTypes.string).isRequired,
  filterDescription: PropTypes.bool.isRequired,
  source: PropTypes.objectOf(PropTypes.any).isRequired,
  dataSU: PropTypes.shape({
    data: PropTypes.objectOf(PropTypes.any).isRequired,
    specialQueenData: PropTypes.objectOf(PropTypes.any).isRequired,
  }).isRequired,
  save: PropTypes.func.isRequired,
  close: PropTypes.func.isRequired,
};

export default React.memo(Orchestrator);